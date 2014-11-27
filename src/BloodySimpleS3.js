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
 * @param {string} filename relative path within the S3 bucket.
 * @return {ReadableStream}
 * @throws {Error} if filename is invalid.
 */
BloodySimpleS3.prototype.createReadStream = function (filename) {
  // make sure filename is valid
  if (!_.isString(filename)) {
    throw new Error(
      'Invalid filename param; ' +
      'expected string, received ' + typeof(filename)
    );
  }

  return this.s3.getObject({
    Key: filename,
    Bucket: this.bucket
  }).createReadStream();
};

/**
 * Downloads the designated file from S3 to local filesystem.
 * @param {string} filename relative path within the S3 bucket.
 * @param {object} [options] request options.
 * @param {string} [options.destination=os.tmpdir()] destination path, i.e. a folder or file.
 * @param {function} [callback] optional callback function, i.e. function(err, path).
 * @return {Promise}
 */
BloodySimpleS3.prototype.download = function (filename, options, callback) {
  var self = this, resolver;

  resolver = function(resolve, reject) {
    // make sure filename param is valid
    if (!_.isString(filename)) {
      return reject(new Error(
        'Invalid filename param; ' +
        'expected string, received ' + typeof(filename)
      ));
    }

    // handle optional params
    if (_.isFunction(options)) {
      callback = options;
      options = {};
    } else if (_.isUndefined(options)) {
      options = {};
    } else if (!_.isObject(options)) {
      return reject(new Error(
        'Invalid options param; ' +
        'expected object, received ' + typeof(options)
      ));
    }

    // set defaults
    options = _.defaults(options, {
      destination: os.tmpdir()
    });

    fs.stat(options.destination, function (err, stats) {
      var target, writable, readable;

      if (err) return reject(err);

      // make sure destination is either file or folder
      if (stats.isDirectory()) {
        target = path.join(options.destination, path.basename(filename));
      } else if (stats.isFile()) {
        target = options.destination;
      } else {
        return reject(new Error(
          'Invalid destination path; ' +
          'expected folder or file'
        ));
      }

      readable = self.createReadStream(filename);
      writable = fs.createWriteStream(target);
      readable.pipe(writable);

      readable.on('error', reject);
      writable.on('finish', function () {
        resolve(target);
      });
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Creates of updates the designated file on S3, consuming a readable stream.
 * @param {string} filename relative path within the S3 bucket.
 * @param {ReadableStream} readable the readable stream to pull the file data.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.writeFileStream = function (filename, readable, callback) {
  var self = this, resolver;

  resolver = function(resolve, reject) {
    // make sure filename param is valid
    if (!_.isString(filename)) {
      return reject(new Error(
        'Invalid filename param; ' +
        'expected string, received ' + typeof(filename)
      ));
    }

    // make sure readable param is valid
    if (!(readable instanceof stream.Readable)) {
      return reject(new Error(
        'Invalid readable param; ' +
        'expected a ReadableStream instance, received ' + typeof(readable)
      ));
    }

    // put object to S3
    self.s3.putObject({
      Key: filename,
      Body: readable,
      Bucket: self.bucket
    }, function (err, data) {
      if (err) return reject(err);

      resolve(_.extend(data, {
        key: filename,
        bucket: self.bucket
      }));
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Uploads the designated file to S3.
 * @param {string} filepath absolute/relative path to file in local disk.
 * @param {object} [options] upload options.
 * @param {string} [options.filename] the filename to store in S3, defaults to the basename of the filepath.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.upload = function (filepath, options, callback) {
  var self = this, resolver;

  resolver = function(resolve, reject) {
    // make sure filepath param is valid
    if (!_.isString(filepath)) {
      return reject(new Error(
        'Invalid filepath param; ' +
        'expected string, received ' + typeof(filepath)
      ));
    }

    // handle optional params
    if (_.isFunction(options)) {
      callback = options;
      options = {};
    } else if (_.isUndefined(options)) {
      options = {};
    } else if (!_.isObject(options)) {
      return reject(new Error(
        'Invalid options param; ' +
        'expected object, received ' + typeof(options)
      ));
    }

    // resolve relative filepath
    filepath = path.resolve(__dirname, filepath);

    // set default values of options
    options = _.defaults(options, {
      filename: path.basename(filepath)
    });

    // make sure filepath is referencing a file
    fs.stat(filepath, function (err, stats) {
      var readable;

      if (err) return reject(err);

      if (!stats.isFile()) {
        return reject(new Error('Filepath does not reference a file'));
      }

      readable = fs.createReadStream(filepath);

      resolve(self.writeFileStream(options.filename, readable));
    });
  };

  return new Promise(resolver).nodeify(callback);
};

module.exports = BloodySimpleS3;

// require('dotenv').load();

// var s3 = new BloodySimpleS3({
//   bucket: process.env.S3_BUCKET,
//   accessKeyId: process.env.S3_ACCESS_KEY_ID,
//   secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
//   region: process.env.S3_REGION,
//   sslEnabled: true
// });

// s3.download({
//   key: 'apk/com.canned.recipes_v1.apk'
// }).then(function (filePath) {
//   console.log(filePath);
// }).catch(function (err) {
//   console.error(err);
// });

// s3.upload({
//   source: path.resolve(__dirname, '../LICENSE'),
//   key: 'apk/test'
// }).then(function (data) {
//   console.log(data);
// }).catch(function (err) {
//   console.error(err);
// });
