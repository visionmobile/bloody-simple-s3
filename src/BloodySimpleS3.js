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
 * @throws {Error} if options are invalid.
 */
BloodySimpleS3.prototype.getObjectStream = function (options) {
  var key;

  // validate options
  if (!_.isPlainObject(options)) {
    throw new Error('Invalid request options, expected plain object, received ' + typeof(options));
  }

  // extract key from options + validate
  key = options.key;
  if (!_.isString(key)) {
    throw new Error('Invalid object key, expected string, received ' + typeof(key));
  }

  return this.s3.getObject({
    Key: key,
    Bucket: this.bucket
  }).createReadStream();
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

    // validate options
    if (!_.isPlainObject(options)) {
      reject('Invalid request options - expected plain object, received ' + typeof(options));
      return;
    }

    // extract key from options + validate
    key = options.key;
    if (!_.isString(key)) {
      reject('Invalid object key - expected string, received ' + typeof(key));
      return;
    }

    destination = options.destination || os.tmpdir();

    // make sure destination is either file or folder
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

    // validate options
    if (!_.isPlainObject(options)) {
      reject('Invalid request options, expected plain object, received ' + typeof(options));
      return;
    }

    // extract key from options + validate
    key = options.key;
    if (!_.isString(key)) {
      reject('Invalid object key, expected string, received ' + typeof(key));
      return;
    }

    // extract body from options + validate
    body = options.body;
    if (!(body instanceof stream.Readable)) {
      reject('Invalid body, expected ReadableStream, received ' + typeof(readable));
      return;
    }

    // put object to S4
    self.s3.putObject({
      Key: key,
      Body: body,
      Bucket: self.bucket
    }, function (err, data) {

      if (err) {
        reject(err);
        return;
      }

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

    // validate options
    if (!_.isPlainObject(options)) {
      reject('Invalid request options - expected plain object, received ' + typeof(options));
      return;
    }

    // extract key from options + validate
    key = options.key || path.basename(source);
    if (!_.isString(key)) {
      reject('Invalid object key - expected string, received ' + typeof(key));
      return;
    }

    // extract source from options + validate
    source = options.source;
    if (!_.isString(source)) {
      reject('Invalid file source path - expected string, received ' + typeof(key));
      return;
    }

    // make sure source is referencing a file
    fs.stat(source, function (err, stats) {
      var readable;

      if (err) {
        reject(err);
        return;
      }

      if (!stats.isFile()) {
        reject('Invalid source - expected string referencing a file');
        return;
      }

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
