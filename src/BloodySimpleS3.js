const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stream = require('stream');
const Promise = require('bluebird');
const CustomError = require('customerror');
const AWS = require('aws-sdk');
const _ = require('lodash');
const type = require('type-of');

Promise.promisifyAll(fs);

class BloodySimpleS3 {

  constructor(options) {
    if (!_.isPlainObject(options)) {
      throw new CustomError(`Invalid options param; expected object, received ${type(options)}`, 'InvalidArgument');
    }

    options = _.defaults(options, {
      region: 'us-east-1',
      sslEnabled: true
    });

    if (!_.isString(options.bucket)) {
      throw new CustomError(`Invalid bucket option; expected string, received ${type(options.bucket)}`, 'InvalidArgument');
    }

    if (!_.isString(options.accessKeyId)) {
      throw new CustomError(`Invalid accessKeyId option; expected string, received ${type(options.accessKeyId)}`, 'InvalidArgument');
    }

    if (!_.isString(options.secretAccessKey)) {
      throw new CustomError(`Invalid secretAccessKey option; expected string, received ${type(options.secretAccessKey)}`, 'InvalidArgument');
    }

    if (!_.isString(options.region)) {
      throw new CustomError(`Invalid region option; expected string, received ${type(options.region)}`, 'InvalidArgument');
    }

    if (!_.isBoolean(options.sslEnabled)) {
      throw new CustomError(`Invalid sslEnabled option; expected boolean, received ${type(options.sslEnabled)}`, 'InvalidArgument');
    }

    this.bucket = options.bucket;

    this.s3 = new AWS.S3({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region,
      sslEnabled: options.sslEnabled,
      apiVersion: '2006-03-01'
    });
  }

  createReadStream(filename) {
    if (!_.isString(filename)) {
      throw new CustomError('Invalid filename param; expected string, received ' + type(filename), 'InvalidArgument');
    }

    const params = {
      Key: filename,
      Bucket: this.bucket
    };

    return this.s3.getObject(params).createReadStream();
  }

  downloadWithoutCheck(source, target, callback) {
    if (!_.isString(source)) {
      return Promise.reject(new CustomError(`Invalid source param; expected string, received ${type(source)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    if (_.isFunction(target)) {
      callback = target;
      target = os.tmpdir();
    } else if (_.isUndefined(target)) {
      target = os.tmpdir();
    }

    if (!_.isString(target)) {
      return Promise.reject(new CustomError(`Invalid target param; expected string, received ${type(target)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    return fs.statAsync(target)

      .then((stat) => {
        if (stat.isDirectory()) return path.join(target, path.basename(source));
        if (stat.isFile()) return target;

        throw new CustomError('Invalid target path; expected directory or file', 'InvalidDownloadTarget');
      })

      .then((file) => {
        const resolver = (resolve, reject) => {
          const readable = this.createReadStream(source);
          const writable = fs.createWriteStream(file);
          readable.pipe(writable);

          readable.on('error', reject);

          writable.on('finish', () => {
            resolve({name: file});
          });
        };

        return new Promise(resolver);
      })

      .nodeify(callback);
  }

  download(source, target, callback) {
    return Promise.props({
      file: this.downloadWithoutCheck(source, target),
      meta: this.getFileMeta(source)
    })

      .then((props) => {
        return fs.readFileAsync(props.file.name)

          .then((buf) => {
            if (props.meta.ETag !== `"${crypto.createHash('md5').update(buf).digest().toString('hex')}"`) {
              return fs.unlinkAsync(props.file.name) // remove downloaded file from disk
                .throw(new CustomError(`Invalid checksum of file ${source}`, 'BadMD5Digest'));
            }

            return props.file;
          });
      })
      .nodeify(callback);
  }

  readBuffer(filename, callback) {
    const resolver = (resolve, reject) => {
      const readable = this.createReadStream(filename);
      const buf = [];

      readable.on('data', (d) => buf.push(d));
      readable.on('end', () => {
        resolve(Buffer.concat(buf));
      });

      readable.on('error', reject);
    };

    return new Promise(resolver).nodeify(callback);
  }

  writeFile(filename, contents, callback) {
    if (!_.isString(filename)) {
      return Promise.reject(new CustomError(`Invalid filename param; expected string, received ${type(filename)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    if (!(contents instanceof stream.Readable) && !(Buffer.isBuffer(contents)) && !_.isString(contents)) {
      return Promise.reject(new CustomError(`Invalid contents param; expected readable stream, buffer or string, received ${type(contents)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    const params = {
      Key: filename,
      Body: contents,
      Bucket: this.bucket
    };

    if (Buffer.isBuffer(contents)) {
      params.ContentMD5 = crypto.createHash('md5').update(contents).digest().toString('base64'); // force integrity check
    }

    const resolver = (resolve, reject) => {
      this.s3.putObject(params, (err) => {
        if (err) return reject(err);
        resolve({name: filename});
      });
    };

    return new Promise(resolver).nodeify(callback);
  }

  upload(source, target, callback) {
    if (!_.isString(source)) {
      return Promise.reject(new CustomError(`Invalid source param; expected string, received ${type(source)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    source = path.resolve(__dirname, source);

    if (_.isFunction(target)) {
      callback = target;
      target = path.basename(source);
    } else if (_.isUndefined(target)) {
      target = path.basename(source);
    }

    if (!_.isString(target)) {
      return Promise.reject(new CustomError(`Invalid target param; expected string, received ${type(target)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    return fs.statAsync(source)

      .then((stat) => {
        if (!stat.isFile()) {
          throw new CustomError('Source is invalid; you must reference a file', 'InvalidUploadSource');
        }

        if (stat.size < os.freemem()) {
          return fs.readFileAsync(source); // memory is suffient - use buffer
        }

        return fs.createReadStream(source);
      })

      .then((contents) => {
        return this.writeFile(target, contents);
      })

      .nodeify(callback);
  }

  list(dir, options, callback) {
    if (!_.isString(dir)) {
      return Promise.reject(new CustomError(`Invalid dir param; expected string, received ${type(dir)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    if (_.isFunction(options)) {
      callback = options;
      options = {};
    } else if (_.isUndefined(options)) {
      options = {};
    }

    if (!_.isPlainObject(options)) {
      return Promise.reject(new CustomError(`Invalid options param; expected object, received ${type(options)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    const params = {
      Bucket: this.bucket,
      Prefix: path.normalize(dir),
      Marker: options.cursor || path.normalize(dir),
      MaxKeys: options.limit
    };

    const resolver = (resolve, reject) => {
      this.s3.listObjects(params, (err, data) => {
        if (err) return reject(err);

        const arr = _.map(data.Contents, (obj) => {
          return {
            name: obj.Key,
            size: obj.Size,
            last_modified: obj.LastModified
          };
        });

        resolve(arr);
      });
    };

    return new Promise(resolver).nodeify(callback);
  }

  copy(source, target, options, callback) {
    if (!_.isString(source)) {
      return Promise.reject(new CustomError(`Invalid source param; expected string, received ${type(source)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    if (!_.isString(target)) {
      return Promise.reject(new CustomError(`Invalid target param; expected string, received ${type(target)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    if (_.isFunction(options)) {
      callback = options;
      options = {};
    } else if (_.isUndefined(options)) {
      options = {};
    }

    if (!_.isPlainObject(options)) {
      return Promise.reject(new CustomError(`Invalid options param; expected object, received ${type(options)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    const params = _.assign(options, {
      Bucket: this.bucket,
      CopySource: encodeURIComponent(path.join(this.bucket, source)),
      Key: target,
      MetadataDirective: 'COPY'
    });

    const resolver = (resolve, reject) => {
      this.s3.copyObject(params, (err, data) => {
        if (err) return reject(err);
        resolve({name: target, last_modified: data.LastModified});
      });
    };

    return new Promise(resolver).nodeify(callback);
  }

  remove(filename, callback) {
    if (!_.isString(filename)) {
      return Promise.reject(new CustomError(`Invalid filename param; expected string, received ${type(filename)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    const params = {
      Bucket: this.bucket,
      Key: filename
    };

    const resolver = (resolve, reject) => {
      this.s3.deleteObject(params, (err) => {
        if (err) return reject(err);
        resolve();
      });
    };

    return new Promise(resolver).nodeify(callback);
  }

  move(source, target, options, callback) {
    if (_.isFunction(options)) {
      callback = options;
      options = {};
    }

    return this.copy(source, target, options)

      .bind(this)

      .then((data) => {
        return this.remove(source).return(data);
      })

      .nodeify(callback);
  }

  rename(...args) {
    return this.move.apply(this, args);
  }

  getFileMeta(filename, callback) {
    if (!_.isString(filename)) {
      return Promise.reject(new CustomError(`Invalid filename param; expected string, received ${type(filename)}`, 'InvalidArgument'))
        .nodeify(callback);
    }

    const params = {
      Key: filename,
      Bucket: this.bucket
    };

    const resolver = (resolve, reject) => {
      this.s3.headObject(params, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    };

    return new Promise(resolver).nodeify(callback);
  }

}

module.exports = BloodySimpleS3;
