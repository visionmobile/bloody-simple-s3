var path = require('path'),
  fs = require('fs'),
  os = require('os'),
  AWS = require('aws-sdk'),
  Promise = require('bluebird'),
  _ = require('lodash');

/**
 * Constructs and returns a new bloody simple S3 client.
 * @param {object} options S3 client options.
 * @param {string} options.bucket the name of the S3 bucket to connect to.
 * @param {string} options.accessKeyId your AWS access key ID.
 * @param {string} options.secretAccessKey your AWS secret access key.
 * @param {string} [options.region=us-east-1] the region to send service requests to.
 * @param {boolean} [options.sslEnabled=true] whether to enable SSL for requests.
 * sslEnabled
 * @constructor
 */
function BloodySimpleS3(options) {
  var bucket, accessKeyId, secretAccessKey, region, sslEnabled;

  // validate "options" param
  if (typeof options !== 'object') {
    throw new Error('Invalid or unspecified S3 options');
  }

  bucket = options.bucket;
  accessKeyId = options.accessKeyId;
  secretAccessKey = options.secretAccessKey;
  region = options.region || 'us-east-1';
  sslEnabled = (options.sslEnabled === undefined) ? true : options.sslEnabled;

  if (typeof bucket !== 'string') throw new Error('Invalid or unspecified S3 bucket');
  if (typeof accessKeyId !== 'string') throw new Error('Invalid or unspecified S3 accessKeyId');
  if (typeof secretAccessKey !== 'string') throw new Error('Invalid or unspecified S3 secretAccessKey');
  if (typeof region !== 'string') throw new Error('Invalid or unspecified S3 region');
  if (typeof sslEnabled !== 'boolean') throw new Error('Invalid or unspecified sslEnabled option');

  this.bucket = bucket;

  this.s3 = new AWS.S3({
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    region: region,
    apiVersion: '2006-03-01'
  });
}

/**
 * Returns a readable stream from the designated object on S3.
 * @param {string} key the relative path of the object in the S3 bucket.
 * @param {object} [options] optional request options.
 * @see {@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property} for a detailed list of request options to use.
 * @return {ReadableStream}
 */
BloodySimpleS3.prototype.getObjectStream = function (key, options) {
  var params;

  // validate "key" param
  if (!_.isString(key)) {
    return Promise.reject('Invalid object key, expected string, received ' + typeof(options));
  }

  // handle optional "options" param
  if (_.isUndefined(options)) {
    options = {};
  } else if (!_.isPlainObject(options)) {
    return Promise.reject('Invalid request options, expected plain object, received ' + typeof(options));
  }

  params = _.extend(options, {
    Key: key,
    Bucket: this.bucket
  });

  return this.s3.getObject(params).createReadStream();
};

/**
 * Retrieves the designated object from S3 and stores it to the local filesystem.
 * @param {string} key the relative path of the object in the S3 bucket.
 * @param {object} [options] optional request options.
 * @param {string} [options.destination=os.tmpdir()] destination path, may represent a folder or file.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @see {@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property} for a detailed list of request options to use.
 * @return {Promise}
 */
BloodySimpleS3.prototype.download = function (key, options, callback) {
  var self = this, destination, resolver;

  // validate "key" param
  if (!_.isString(key)) {
    return Promise.reject('Invalid object key, expected string, received ' + typeof(options));
  }

  // handle optional "options" param
  if (_.isUndefined(options)) {
    options = {};
  } else if (_.isFunction(options)) {
    callback = options;
    options = {};
  } else if (!_.isPlainObject(options)) {
    return Promise.reject('Invalid request options, expected plain object, received ' + typeof(options));
  }

  destination = options.destination || os.tmpdir();

  resolver = function(resolve, reject) {
    fs.stat(destination, function (err, stats) {
      var targetPath, writable, readable;

      if (err) return reject(err);

      if (stats.isDirectory()) {
        targetPath = path.join(destination, path.basename(key));
      } else if (stats.isFile()) {
        targetPath = destination;
      } else {
        reject('Invalid directory path, expected a folder or file path');
      }

      readable = self.getObjectStream(key, options);
      writable = fs.createWriteStream(targetPath);
      readable.pipe(writable);

      readable.on('error', reject);
      writable.on('finish', function () {
        resolve(targetPath);
      });
    });
  };

  return new Promise(resolver);
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

// s3.download('apk/lean-canvas.pdf').then(function (filePath) {
//   console.log(filePath);
// }).catch(function (err) {
//   console.error(err);
// });
