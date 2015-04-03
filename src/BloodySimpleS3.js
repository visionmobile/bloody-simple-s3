var path = require('path');
var fs = require('fs');
var os = require('os');
var stream = require('stream');
var AWS = require('aws-sdk');
var Promise = require('bluebird');
var _ = require('lodash');

function BloodySimpleS3(options) {
  if (!_.isPlainObject(options)) {
    throw new Error('Invalid options param; expected object, received ' + typeof(options));
  }

  options = _.defaults(options, {
    region: 'us-east-1',
    sslEnabled: true
  });

  if (!_.isString(options.bucket)) {
    throw new Error('Invalid bucket option; expected string, received ' + typeof(options.bucket));
  }

  if (!_.isString(options.accessKeyId)) {
    throw new Error('Invalid accessKeyId option; expected string, received ' + typeof(options.accessKeyId));
  }

  if (!_.isString(options.secretAccessKey)) {
    throw new Error('Invalid secretAccessKey option; expected string, received ' + typeof(options.secretAccessKey));
  }

  if (!_.isString(options.region)) {
    throw new Error('Invalid region option; expected string, received ' + typeof(options.region));
  }

  if (!_.isBoolean(options.sslEnabled)) {
    throw new Error('Invalid sslEnabled option; expected boolean, received ' + typeof(options.sslEnabled));
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
    throw new Error('Invalid filename param; expected string, received ' + typeof(filename));
  }

  params = {
    Key: filename,
    Bucket: this.bucket
  };

  return this.s3.getObject(params).createReadStream();
};

BloodySimpleS3.prototype.download = function (source, target, callback) {
  var _this = this;
  var resolver;

  if (!_.isString(source)) {
    return Promise.reject(new Error('Invalid source param; expected string, received ' + typeof(source)))
      .nodeify(callback);
  }

  if (_.isFunction(target)) {
    callback = target;
    target = os.tmpdir();
  } else if (_.isUndefined(target)) {
    target = os.tmpdir();
  }

  if (!_.isString(target)) {
    return Promise.reject(new Error('Invalid target param; expected string, received ' + typeof(target)))
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
        return reject(new Error('Invalid target path; expected directory or file'));
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

  return new Promise(resolver)
    .nodeify(callback);
};

BloodySimpleS3.prototype.writeFile = function (filename, contents, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(filename)) {
    return Promise.reject(new Error('Invalid filename param; expected string, received ' + typeof(filename)))
      .nodeify(callback);
  }

  if (
    !(contents instanceof stream.Readable) &&
    !(Buffer.isBuffer(contents)) &&
    !_.isString(contents)
  ) {
    return Promise.reject(new Error('Invalid contents param; expected readable stream, buffer or string, received ' + typeof(contents)))
      .nodeify(callback);
  }

  params = {
    Key: filename,
    Body: contents,
    Bucket: _this.bucket
  };

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
  var resolver;

  if (!_.isString(source)) {
    return Promise.reject(new Error('Invalid source param; expected string, received ' + typeof(source)))
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
    return Promise.reject(new Error('Invalid target param; expected string, received ' + typeof(target)))
      .nodeify(callback);
  }

  resolver = function(resolve, reject) {
    fs.stat(source, function (err, stats) {
      var readable;

      if (err) return reject(err);

      if (!stats.isFile()) {
        return reject(new Error('Source is invalid; you must reference a file'));
      }

      readable = fs.createReadStream(source);

      resolve(_this.writeFile(target, readable));
    });
  };

  return new Promise(resolver)
    .nodeify(callback);
};

BloodySimpleS3.prototype.list = function (dir, options, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(dir)) {
    return Promise.reject(new Error('Invalid dir param; expected string, received ' + typeof(dir)))
      .nodeify(callback);
  }

  if (_.isFunction(options)) {
    callback = options;
    options = {};
  } else if (_.isUndefined(options)) {
    options = {};
  }

  if (!_.isPlainObject(options)) {
    return Promise.reject(new Error('Invalid options param; expected object, received ' + typeof(options)))
      .nodeify(callback);
  }

  params = {
    Bucket: this.bucket,
    Prefix: path.normalize(dir),
    Marker: options.cursor,
    MaxKeys: options.limit
  };

  resolver = function(resolve, reject) {
    _this.s3.listObjects(params, function(err, data) {
      var arr;

      if (err) return reject(err);

      arr = data.Contents.map(function (obj) {
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
    return Promise.reject(new Error('Invalid source param; expected string, received ' + typeof(source)))
      .nodeify(callback);
  }

  if (!_.isString(target)) {
    return Promise.reject(new Error('Invalid target param; expected string, received ' + typeof(target)))
      .nodeify(callback);
  }

  if (_.isFunction(options)) {
    callback = options;
    options = {};
  } else if (_.isUndefined(options)) {
    options = {};
  }

  if (!_.isPlainObject(options)) {
    return Promise.reject(new Error('Invalid options param; expected object, received ' + typeof(options)))
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
    return Promise.reject(new Error('Invalid filename param; expected string, received ' + typeof(filename)))
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

module.exports = BloodySimpleS3;
