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

  if (!_.isPlainObject(options)) throw new Error('Invalid or unspecified options');

  bucket = options.bucket;
  accessKeyId = options.accessKeyId;
  secretAccessKey = options.secretAccessKey;
  region = options.region || 'us-east-1';
  sslEnabled = (options.sslEnabled === undefined) ? true : options.sslEnabled;

  if (!_.isString(bucket)) throw new Error('Invalid or unspecified S3 bucket');
  if (!_.isString(accessKeyId)) throw new Error('Invalid or unspecified S3 accessKeyId');
  if (!_.isString(secretAccessKey)) throw new Error('Invalid or unspecified S3 secretAccessKey');
  if (!_.isString(region)) throw new Error('Invalid or unspecified S3 region');
  if (!_.isBoolean(sslEnabled)) throw new Error('Invalid or unspecified sslEnabled option');

  this.bucket = bucket;

  this.s3 = new AWS.S3({
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    region: region,
    apiVersion: '2006-03-01'
  });
}

/**
 * Returns a readable stream to retrieve the designated object from S3.
 * @param {object} options request options.
 * @param {string} options.key the object's key, i.e. a relative path to the S3 bucket.
 * @return {ReadableStream}
 */
BloodySimpleS3.prototype.getObjectStream = function (options) {
  var key, params;

  if (!_.isPlainObject(options)) {
    return Promise.reject('Invalid request options, expected plain object, received ' + typeof(options));
  }

  key = options.key;

  if (!_.isString(key)) {
    return Promise.reject('Invalid object key, expected string, received ' + typeof(key));
  }

  params = _.extend(options, {
    Key: key,
    Bucket: this.bucket
  });

  return this.s3.getObject(params).createReadStream();
};

/**
 * Downloads the designated object from S3 and stores it to the local filesystem.
 * @param {object} options request options.
 * @param {string} options.key the object's key, i.e. a relative path to the S3 bucket.
 * @param {string} [options.destination=os.tmpdir()] destination path, i.e. a folder or file.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @see {@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property} for a detailed list of request options to use.
 * @return {Promise}
 */
BloodySimpleS3.prototype.download = function (options, callback) {
  var self = this, resolver;

  resolver = function(resolve, reject) {
    var key, destination;

    if (!_.isPlainObject(options)) return Promise.reject('Invalid request options, expected plain object, received ' + typeof(options));

    key = options.key;
    destination = options.destination || os.tmpdir();

    if (!_.isString(key)) return Promise.reject('Invalid object key, expected string, received ' + typeof(key));

    fs.stat(destination, function (err, stats) {
      var target, writable, readable;

      if (err) return reject(err);

      if (stats.isDirectory()) {
        target = path.join(destination, path.basename(key));
      } else if (stats.isFile()) {
        target = destination;
      } else {
        return reject('Invalid directory path, expected a folder or file');
      }

      readable = self.getObjectStream(options);
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
 * Creates of updates an object on S3 by consuming a readable stream.
 * @param {object} options request options.
 * @param {string} options.key the object's key, i.e. a relative path to the S3 bucket.
 * @param {ReadableStream} options.body the body stream to consume the file data.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @return {Promise}
 */
BloodySimpleS3.prototype.putObjectStream = function (options, callback) {
  var self = this, resolver;

  resolver = function(resolve, reject) {
    var key, body;

    if (!_.isPlainObject(options)) return reject('Invalid request options, expected plain object, received ' + typeof(options));

    key = options.key;
    body = options.body;

    if (!_.isString(key)) return reject('Invalid object key, expected string, received ' + typeof(key));
    if (!(body instanceof stream.Readable)) return reject('Invalid body, expected ReadableStream, received ' + typeof(readable));

    self.s3.putObject({
      Key: key,
      Body: body,
      Bucket: self.bucket
    }, function (err, data) {
      if (err) reject(err);

      resolve(_.extend(data, {
        key: key,
        bucket: self.bucket
      }));
    });
  };

  return new Promise(resolver).nodeify(callback);
};

/**
 * Uploads the designated file to S3.
 * @param {object} options request options.
 * @param {string} options.source path to source file.
 * @param {string} [options.key] the object's key, defaults to source filename.
 * @param {function} [callback] optional callback function, i.e. function(err, data).
 * @see {@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property} for a detailed list of request options to use.
 * @return {Promise}
 */
BloodySimpleS3.prototype.upload = function (options, callback) {
  var self = this, resolver;

  resolver = function(resolve, reject) {
    var key, source;

    if (!_.isPlainObject(options)) return Promise.reject('Invalid request options - expected plain object, received ' + typeof(options));

    source = options.source;
    if (!_.isString(source)) return Promise.reject('Invalid file source path - expected string, received ' + typeof(key));

    key = path.basename(source) || key;
    if (!_.isString(key)) return Promise.reject('Invalid object key - expected string, received ' + typeof(key));

    fs.stat(source, function (err, stats) {
      var readable;

      if (err) return reject(err);
      if (!stats.isFile()) return reject('Invalid source path - expected string referencing a file');

      readable = fs.createReadStream(source);

      resolve(self.putObjectStream({
        key: key,
        body: readable
      }));
    });
  };

  return new Promise(resolver).nodeify(callback);
};

module.exports = BloodySimpleS3;

require('dotenv').load();

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

// s3.upload({
//   source: path.resolve(__dirname, '../LICENSE')
// }).then(function (data) {
//   console.log(data);
// }).catch(function (err) {
//   console.error(err);
// });
