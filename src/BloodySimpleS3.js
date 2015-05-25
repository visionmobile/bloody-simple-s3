var path = require('path');
var os = require('os');
var crypto = require('crypto');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var os = require('os');
var stream = require('stream');
var AWS = require('aws-sdk');
var Promise = require('bluebird');
var _ = require('lodash');
var type = require('type-of');

var CustomError = require('./CustomError');

function BloodySimpleS3(options) {
  if (!_.isPlainObject(options)) {
    throw new CustomError('Invalid options param; expected object, received ' + type(options), 'InvalidArgument');
  }

  options = _.defaults(options, {
    region: 'us-east-1',
    sslEnabled: true
  });

  if (!_.isString(options.bucket)) {
    throw new CustomError('Invalid bucket option; expected string, received ' + type(options.bucket), 'InvalidArgument');
  }

  if (!_.isString(options.accessKeyId)) {
    throw new CustomError('Invalid accessKeyId option; expected string, received ' + type(options.accessKeyId), 'InvalidArgument');
  }

  if (!_.isString(options.secretAccessKey)) {
    throw new CustomError('Invalid secretAccessKey option; expected string, received ' + type(options.secretAccessKey), 'InvalidArgument');
  }

  if (!_.isString(options.region)) {
    throw new CustomError('Invalid region option; expected string, received ' + type(options.region), 'InvalidArgument');
  }

  if (!_.isBoolean(options.sslEnabled)) {
    throw new CustomError('Invalid sslEnabled option; expected boolean, received ' + type(options.sslEnabled), 'InvalidArgument');
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

BloodySimpleS3.prototype.createReadStream = function (filename) {
  var params;

  if (!_.isString(filename)) {
    throw new CustomError('Invalid filename param; expected string, received ' + type(filename), 'InvalidArgument');
  }

  params = {
    Key: filename,
    Bucket: this.bucket
  };

  return this.s3.getObject(params).createReadStream();
};

BloodySimpleS3.prototype.downloadWithoutCheck = function (source, target, callback) {
  var _this = this;
  var resolver;

  if (!_.isString(source)) {
    return Promise.reject(new CustomError('Invalid source param; expected string, received ' + type(source)), 'InvalidArgument')
      .nodeify(callback);
  }

  if (_.isFunction(target)) {
    callback = target;
    target = os.tmpdir();
  } else if (_.isUndefined(target)) {
    target = os.tmpdir();
  }

  if (!_.isString(target)) {
    return Promise.reject(new CustomError('Invalid target param; expected string, received ' + type(target)), 'InvalidArgument')
      .nodeify(callback);
  }

  resolver = function(resolve, reject) {
    fs.stat(target, function (err, stats) {
      var file, writable, readable;

      if (err) return reject(err);

      if (stats.isDirectory()) {
        file = path.join(target, path.basename(source));

      } else if (stats.isFile()) {
        file = target;

      } else {
        return reject(new CustomError('Invalid target path; expected directory or file', 'InvalidDownloadTarget'));
      }

      readable = _this.createReadStream(source);
      writable = fs.createWriteStream(file);
      readable.pipe(writable);

      readable.on('error', reject);

      writable.on('finish', function () {
        resolve({name: file});
      });
    });
  };

  return new Promise(resolver).nodeify(callback);
};

BloodySimpleS3.prototype.download = function (source, target, callback) {
  return Promise.props({
    file: this.downloadWithoutCheck(source, target),
    meta: this.getFileMeta(source)
  })
    .then(function (props) {
      return fs.readFileAsync(props.file.name)
        .then(function (buf) {
          if (props.meta.ETag !== '"' + crypto.createHash('md5').update(buf).digest().toString('hex') + '"') {
            return fs.unlinkAsync(props.file.name) // remove downloaded file from disk
              .throw(new CustomError('Invalid checksum of file ' + source, 'BadMD5Digest'));
          }

          return props.file;
        });
    })
    .nodeify(callback);
};

BloodySimpleS3.prototype.readBuffer = function (filename, callback) {
  var _this = this;
  var resolver;

  resolver = function(resolve, reject) {
    var readable = _this.createReadStream(filename);
    var buf = [];

    readable.on('data', function(d) {
      buf.push(d);
    });

    readable.on('end', function() {
      resolve(Buffer.concat(buf));
    });

    readable.on('error', reject);
  };

  return new Promise(resolver)
    .nodeify(callback);
};

BloodySimpleS3.prototype.writeFile = function (filename, contents, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(filename)) {
    return Promise.reject(new CustomError('Invalid filename param; expected string, received ' + type(filename)), 'InvalidArgument')
      .nodeify(callback);
  }

  if (!(contents instanceof stream.Readable) && !(Buffer.isBuffer(contents)) && !_.isString(contents)) {
    return Promise.reject(new CustomError('Invalid contents param; expected readable stream, buffer or string, received ' + type(contents)), 'InvalidArgument')
      .nodeify(callback);
  }

  params = {
    Key: filename,
    Body: contents,
    Bucket: _this.bucket
  };

  if (Buffer.isBuffer(contents)) {
    params.ContentMD5 = crypto.createHash('md5').update(contents).digest().toString('base64'); // force integrity check
  }

  resolver = function(resolve, reject) {
    _this.s3.putObject(params, function (err) {
      if (err) return reject(err);
      resolve({name: filename});
    });
  };

  return new Promise(resolver)
    .nodeify(callback);
};

BloodySimpleS3.prototype.upload = function (source, target, callback) {
  var _this = this;

  if (!_.isString(source)) {
    return Promise.reject(new CustomError('Invalid source param; expected string, received ' + type(source)), 'InvalidArgument')
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
    return Promise.reject(new CustomError('Invalid target param; expected string, received ' + type(target)), 'InvalidArgument')
      .nodeify(callback);
  }

  return fs.statAsync(source)
    .then(function (stats) {
      if (!stats.isFile()) {
        throw new CustomError('Source is invalid; you must reference a file', 'InvalidUploadSource');
      }

      if (stats.size < os.freemem()) {
        return fs.readFileAsync(source); // memory is suffient - use buffer
      }

      return fs.createReadStream(source);
    })
    .then(function (contents) {
      return _this.writeFile(target, contents);
    })
    .nodeify(callback);
};

BloodySimpleS3.prototype.list = function (dir, options, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(dir)) {
    return Promise.reject(new CustomError('Invalid dir param; expected string, received ' + type(dir)), 'InvalidArgument')
      .nodeify(callback);
  }

  if (_.isFunction(options)) {
    callback = options;
    options = {};
  } else if (_.isUndefined(options)) {
    options = {};
  }

  if (!_.isPlainObject(options)) {
    return Promise.reject(new CustomError('Invalid options param; expected object, received ' + type(options)), 'InvalidArgument')
      .nodeify(callback);
  }

  params = {
    Bucket: this.bucket,
    Prefix: path.normalize(dir),
    Marker: options.cursor || path.normalize(dir),
    MaxKeys: options.limit
  };

  resolver = function(resolve, reject) {
    _this.s3.listObjects(params, function(err, data) {
      var arr;

      if (err) return reject(err);

      arr = _.map(data.Contents, function (obj) {
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
};

BloodySimpleS3.prototype.copy = function (source, target, options, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(source)) {
    return Promise.reject(new CustomError('Invalid source param; expected string, received ' + type(source)), 'InvalidArgument')
      .nodeify(callback);
  }

  if (!_.isString(target)) {
    return Promise.reject(new CustomError('Invalid target param; expected string, received ' + type(target)), 'InvalidArgument')
      .nodeify(callback);
  }

  if (_.isFunction(options)) {
    callback = options;
    options = {};
  } else if (_.isUndefined(options)) {
    options = {};
  }

  if (!_.isPlainObject(options)) {
    return Promise.reject(new CustomError('Invalid options param; expected object, received ' + type(options)), 'InvalidArgument')
      .nodeify(callback);
  }

  params = _.assign(options, {
    Bucket: this.bucket,
    CopySource: encodeURIComponent(path.join(this.bucket, source)),
    Key: target,
    MetadataDirective: 'COPY'
  });

  resolver = function(resolve, reject) {
    _this.s3.copyObject(params, function(err, data) {
      if (err) return reject(err);
      resolve({name: target, last_modified: data.LastModified});
    });
  };

  return new Promise(resolver).nodeify(callback);
};

BloodySimpleS3.prototype.remove = function (filename, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(filename)) {
    return Promise.reject(new CustomError('Invalid filename param; expected string, received ' + type(filename)), 'InvalidArgument')
      .nodeify(callback);
  }

  params = {
    Bucket: this.bucket,
    Key: filename
  };

  resolver = function(resolve, reject) {
    _this.s3.deleteObject(params, function(err) {
      if (err) return reject(err);
      resolve();
    });
  };

  return new Promise(resolver).nodeify(callback);
};

BloodySimpleS3.prototype.move = function (source, target, options, callback) {
  if (_.isFunction(options)) {
    callback = options;
    options = {};
  }

  return this.copy(source, target, options)
    .bind(this)
    .then(function (data) {
      return this.remove(source).return(data);
    })
    .nodeify(callback);
};

BloodySimpleS3.prototype.rename = BloodySimpleS3.prototype.move;

BloodySimpleS3.prototype.getFileMeta = function (filename, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(filename)) {
    throw new CustomError('Invalid filename param; expected string, received ' + type(filename), 'InvalidArgument');
  }

  params = {
    Key: filename,
    Bucket: this.bucket
  };

  resolver = function(resolve, reject) {
    _this.s3.headObject(params, function (err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  };

  return new Promise(resolver).nodeify(callback);
};

module.exports = BloodySimpleS3;
