var path = require('path'),
  fs = require('fs'),
  os = require('os'),
  stream = require('stream'),
  AWS = require('aws-sdk'),
  Promise = require('bluebird'),
  _ = require('lodash');

/**
 * Constructs and returns a new bloody simple S3 client.
 * @param {object} options S3 client options.
 * @param {string} options.bucket name of the S3 bucket to connect to.
 * @param {string} options.accessKeyId your AWS access key ID.
 * @param {string} options.secretAccessKey your AWS secret access key.
 * @param {string} [options.region=us-east-1] AWS region, defaults to us-east-1.
 * @param {boolean} [options.sslEnabled=true] whether to enable SSL for requests.
 * @throws {Error} if options are invalid.
 * @constructor
 */
function BloodySimpleS3(options) {
  // make sure options is valid
  if (!_.isPlainObject(options)) {
    throw new Error('Invalid options param; expected object, received ' + typeof(options));
  }

  // set default options
  options = _.defaults(options, {
    region: 'us-east-1',
    sslEnabled: true
  });

  // make sure individual options are valid
  if (!_.isString(options.bucket)) {
    throw new Error(
      'Invalid S3 bucket option; ' +
      'expected string, received ' + typeof(options.bucket)
    );
  }

  if (!_.isString(options.accessKeyId)) {
    throw new Error(
      'Invalid accessKeyId option; ' +
      'expected string, received ' + typeof(options.accessKeyId)
    );
  }

  if (!_.isString(options.secretAccessKey)) {
    throw new Error(
      'Invalid secretAccessKey option; ' +
      'expected string, received ' + typeof(options.secretAccessKey)
    );
  }

  if (!_.isString(options.region)) {
    throw new Error(
      'Invalid region option; ' +
      'expected string, received ' + typeof(options.region)
    );
  }

  if (!_.isBoolean(options.sslEnabled)) {
    throw new Error(
      'Invalid sslEnabled option; ' +
      'expected boolean, received ' + typeof(options.sslEnabled)
    );
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

/**
 * Creates and returns a readable stream to the designated file on S3.
 * @param {string} key relative path within the S3 bucket.
 * @return {ReadableStream}
 * @throws {Error} if key is invalid.
 */
BloodySimpleS3.prototype.createReadStream = function (key) {
  var params;

  // make sure key is valid
  if (!_.isString(key)) {
    throw new Error(
      'Invalid key param; ' +
      'expected string, received ' + typeof(key)
    );
  }

  params = {
    Key: key,
    Bucket: this.bucket
  };

  return this.s3.getObject(params).createReadStream();
};

/**
 * Downloads the designated file from S3 to local filesystem.
 * @param {string} key relative path within the S3 bucket.
 * @param {object} [options] request options.
 * @param {string} [options.destination=os.tmpdir()] destination path, i.e. a folder or file.
 * @param {function} [callback] optional callback function, i.e. function(err, path).
 * @return {Promise}
 */
BloodySimpleS3.prototype.download = function (key, options, callback) {
  var self = this, resolver;

  // make sure key param is valid
  if (!_.isString(key)) {
    return Promise.reject(new Error(
      'Invalid key param; ' +
      'expected string, received ' + typeof(key)
    )).nodeify(callback);
  }

  // handle optional params
  if (!_.isPlainObject(options)) {
    if (_.isFunction(options)) {
      callback = options;
    } else if (!_.isUndefined(options)) {
      return Promise.reject(new Error(
        'Invalid options param; ' +
        'expected object, received ' + typeof(options)
      )).nodeify(callback);
    }

    options = {};
  }

  // set options defaults
  options = _.defaults(options, {
    destination: os.tmpdir()
  });

  resolver = function(resolve, reject) {
    fs.stat(options.destination, function (err, stats) {
      var file, writable, readable;

      if (err) return reject(err);

      // make sure destination is either file or folder
      if (stats.isDirectory()) {
        file = path.join(options.destination, path.basename(key));
      } else if (stats.isFile()) {
        file = options.destination;
      } else {
        return reject(new Error(
          'Invalid destination path; ' +
          'expected folder or file'
        ));
      }

      readable = self.createReadStream(key);
      writable = fs.createWriteStream(file);
      readable.pipe(writable);

      readable.on('error', reject);
      writable.on('finish', function () {
        resolve(file);
      });
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Creates of updates the designated file on S3, consuming a readable stream.
 * @param {string} key relative path within the S3 bucket.
 * @param {ReadableStream} readable the readable stream to pull the file data.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.writeFileStream = function (key, readable, callback) {
  var self = this, params, resolver;

  // make sure key param is valid
  if (!_.isString(key)) {
    return Promise.reject(new Error(
      'Invalid key param; ' +
      'expected string, received ' + typeof(key)
    )).nodeify(callback);
  }

  // make sure readable param is valid
  if (!(readable instanceof stream.Readable)) {
    return Promise.reject(new Error(
      'Invalid readable param; ' +
      'expected a ReadableStream instance, received ' + typeof(readable)
    )).nodeify(callback);
  }

  params = {
    Key: key,
    Body: readable,
    Bucket: self.bucket
  };

  resolver = function(resolve, reject) {
    self.s3.putObject(params, function (err, data) {
      if (err) return reject(err);
      resolve(_.extend(data, {key: key, bucket: self.bucket}));
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Uploads the designated file to S3.
 * @param {string} file absolute/relative path to file in local disk.
 * @param {object} [options] upload options.
 * @param {string} [options.key] the file name to store in S3.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.upload = function (file, options, callback) {
  var self = this, resolver;

  // make sure file param is valid
  if (!_.isString(file)) {
    return Promise.reject(new Error(
      'Invalid file param; ' +
      'expected string, received ' + typeof(file)
    )).nodeify(callback);
  }

  // handle optional params
  if (!_.isPlainObject(options)) {
    if (_.isFunction(options)) {
      callback = options;
    } else if (!_.isUndefined(options)) {
      return Promise.reject(new Error(
        'Invalid options param; ' +
        'expected object, received ' + typeof(options)
      )).nodeify(callback);
    }

    options = {};
  }

  // resolve relative file
  file = path.resolve(__dirname, file);

  // set default values of options
  options = _.defaults(options, {
    key: path.basename(file)
  });

  resolver = function(resolve, reject) {
    fs.stat(file, function (err, stats) {
      var readable;

      if (err) return reject(err);

      // make sure file is referencing a file
      if (!stats.isFile()) {
        return reject(new Error(
          'File path is invalid; ' +
          'you need to reference an actual file'
        ));
      }

      readable = fs.createReadStream(file);

      resolve(self.writeFileStream(options.key, readable));
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Returns an array of (up to 1000) files in the designated directory.
 * @param {string} dir relative directory path within the S3 bucket.
 * @param {object} [options] list options.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.list = function (dir, options, callback) {
  var self = this, params, resolver;

  // make sure dir param is valid
  if (!_.isString(dir)) {
    return Promise.reject(new Error(
      'Invalid dir param; ' +
      'expected string, received ' + typeof(dir)
    )).nodeify(callback);
  }

  // handle options param
  if (!_.isPlainObject(options)) {
    if (_.isFunction(options)) {
      callback = options;
    } else if (!_.isUndefined(options)) {
      return Promise.reject(new Error(
        'Invalid options param; ' +
        'expected object, received ' + typeof(options)
      )).nodeify(callback);
    }

    options = {};
  }

  params = _.assign(options, {
    Bucket: this.bucket,
    Prefix: path.normalize(dir)
  });

  resolver = function(resolve, reject) {
    self.s3.listObjects(params, function(err, data) {
      var arr;

      if (err) return reject(err);

      arr = data.Contents.map(function (obj) {
        return {
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified
        };
      });

      resolve(arr);
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Copies the given file to the designated key in S3.
 * @param {string} source relative path of the source file within the S3 bucket.
 * @param {string} key relative path of the copy within the S3 bucket.
 * @param {object} [options] copy options.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.copy = function (source, key, options, callback) {
  var self = this, params, resolver;

  // make sure source param is valid
  if (!_.isString(source)) return Promise.reject(new Error(
    'Invalid source param; ' +
    'expected string, received ' + typeof(source)
  )).nodeify(callback);

  // make sure key param is valid
  if (!_.isString(key)) return Promise.reject(new Error(
    'Invalid key param; ' +
    'expected string, received ' + typeof(key)
  )).nodeify(callback);

  // handle options param
  if (!_.isPlainObject(options)) {
    if (_.isFunction(options)) {
      callback = options;
    } else if (!_.isUndefined(options)) {
      return Promise.reject(new Error(
        'Invalid options param; ' +
        'expected object, received ' + typeof(options)
      )).nodeify(callback);
    }

    options = {};
  }

  params = _.assign(options, {
    Bucket: this.bucket,
    CopySource: path.resolve(this.bucket, source),
    Key: key
  });

  resolver = function(resolve, reject) {
    self.s3.copyObject(params, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Removes the designated file from in S3.
 * @param {string} key relative path within the S3 bucket.
 * @param {object} [options] remove options.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.remove = function (key, callback) {
  var self = this, params, resolver;

  // make sure key param is valid
  if (!_.isString(key)) return Promise.reject(new Error(
    'Invalid key param; ' +
    'expected string, received ' + typeof(key)
  )).nodeify(callback);

  params = {
    Bucket: this.bucket,
    Key: key
  };

  resolver = function(resolve, reject) {
    self.s3.deleteObject(params, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Moves the given file to the designated key in S3.
 * @param {string} source relative path of the source file within the S3 bucket.
 * @param {string} key relative path of the copy within the S3 bucket.
 * @param {object} [options] move options (similar to copy options).
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.move = function (source, key, options, callback) {
  return this.copy(source, key)
    .bind(this)
    .then(function () {
      return this.remove(source);
    })
    .nodeify(callback);
};

module.exports = BloodySimpleS3;

// require('dotenv').load();

// var s3 = new BloodySimpleS3({
//   bucket: 'sdk-analytics',
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   sslEnabled: true
// });

// s3.list('./temp')
//   .then(function (arr) {
//     return s3.copy(arr[0].key, 'temp/a');
//     // console.log(arr);
//   })
//   .then(function (data) {
//     console.log(data);
//   })
//   .catch(function (err) {
//     console.error(err);
//   });

// s3.upload({
//   source: path.resolve(__dirname, '../LICENSE'),
//   key: 'apk/test'
// }).then(function (data) {
//   console.log(data);
// }).catch(function (err) {
//   console.error(err);
// });
