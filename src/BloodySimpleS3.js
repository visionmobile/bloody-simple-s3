var pathjs = require('path');
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

  // set default options
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


BloodySimpleS3.prototype.createReadStream = function (path) {
  var params;

  if (!_.isString(path)) {
    throw new Error('Invalid path param; expected string, received ' + typeof(path));
  }

  params = {
    Key: path,
    Bucket: this.bucket
  };

  return this.s3.getObject(params).createReadStream();
};


BloodySimpleS3.prototype.download = function (path, options, callback) {
  var _this = this;
  var resolver;

  if (!_.isString(path)) {
    return Promise.reject(new Error('Invalid path param; expected string, received ' + typeof(path)))
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

  // set default options
  options = _.defaults(options, {
    destination: os.tmpdir()
  });

  resolver = function(resolve, reject) {
    fs.stat(options.destination, function (err, stats) {
      var file, writable, readable;

      if (err) return reject(err);

      if (stats.isDirectory()) {
        file = pathjs.join(options.destination, pathjs.basename(path));

      } else if (stats.isFile()) {
        file = options.destination;

      } else {
        return reject(new Error('Invalid destination path; expected folder or file'));
      }

      readable = _this.createReadStream(path);
      writable = fs.createWriteStream(file);
      readable.pipe(writable);

      readable.on('error', reject);
      writable.on('finish', function () {
        resolve({
          path: file
        });
      });
    });
  };

  return new Promise(resolver).nodeify(callback);
};


BloodySimpleS3.prototype.writeFileStream = function (path, readable, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(path)) {
    return Promise.reject(new Error('Invalid path param; expected string, received ' + typeof(path)))
      .nodeify(callback);
  }

  if (!(readable instanceof stream.Readable)) {
    return Promise.reject(new Error('Invalid readable param; expected ReadableStream, received ' + typeof(readable)))
      .nodeify(callback);
  }

  params = {
    Key: path,
    Body: readable,
    Bucket: _this.bucket
  };

  resolver = function(resolve, reject) {
    _this.s3.putObject(params, function (err) {
      if (err) return reject(err);

      resolve({
        key: path, // legacy
        path: path
      });
    });
  };

  return new Promise(resolver).nodeify(callback);
};


BloodySimpleS3.prototype.upload = function (path, options, callback) {
  var _this = this;
  var resolver;

  if (!_.isString(path)) {
    return Promise.reject(new Error('Invalid path param; expected string, received ' + typeof(path)))
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

  // resolve (possible) relative path
  path = pathjs.resolve(__dirname, path);

  // set default options
  options = _.defaults(options, {
    destination: pathjs.basename(path)
  });

  resolver = function(resolve, reject) {
    fs.stat(path, function (err, stats) {
      var readable;

      if (err) return reject(err);

      if (!stats.isFile()) {
        return reject(new Error('File path is invalid; you must reference an actual file'));
      }

      readable = fs.createReadStream(path);

      resolve(_this.writeFileStream(options.destination, readable));
    });
  };

  return new Promise(resolver).nodeify(callback);
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
    Prefix: pathjs.normalize(dir),
    Marker: options.cursor,
    MaxKeys: options.limit
  };

  resolver = function(resolve, reject) {
    _this.s3.listObjects(params, function(err, data) {
      var arr;

      if (err) return reject(err);

      arr = data.Contents.map(function (obj) {
        return {
          key: obj.Key, // legacy
          path: obj.Key,
          size: obj.Size,
          last_modified: obj.LastModified
        };
      });

      resolve(arr);
    });
  };

  return new Promise(resolver).nodeify(callback);
};


BloodySimpleS3.prototype.copy = function (source, destination, options, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(source)) {
    return Promise.reject(new Error('Invalid source param; expected string, received ' + typeof(source)))
      .nodeify(callback);
  }

  if (!_.isString(destination)) {
    return Promise.reject(new Error('Invalid destination param; expected string, received ' + typeof(destination)))
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
    CopySource: encodeURIComponent(pathjs.join(this.bucket, source)),
    Key: destination,
    MetadataDirective: 'COPY'
  });

  resolver = function(resolve, reject) {
    _this.s3.copyObject(params, function(err, data) {
      if (err) return reject(err);

      resolve({
        key: destination,
        path: destination,
        last_modified: data.LastModified
      });
    });
  };

  return new Promise(resolver).nodeify(callback);
};


BloodySimpleS3.prototype.remove = function (path, callback) {
  var _this = this;
  var params;
  var resolver;

  if (!_.isString(path)) {
    return Promise.reject(new Error('Invalid path param; expected string, received ' + typeof(path)))
      .nodeify(callback);
  }

  params = {
    Bucket: this.bucket,
    Key: path
  };

  resolver = function(resolve, reject) {
    _this.s3.deleteObject(params, function(err) {
      if (err) return reject(err);
      resolve();
    });
  };

  return new Promise(resolver).nodeify(callback);
};


BloodySimpleS3.prototype.move = function (source, destination, options, callback) {
  if (_.isFunction(options)) {
    callback = options;
    options = {};
  }

  return this.copy(source, destination, options)
    .bind(this)
    .then(function (data) {
      return this.remove(source).return(data);
    })
    .nodeify(callback);
};

BloodySimpleS3.prototype.rename = BloodySimpleS3.prototype.move;

module.exports = BloodySimpleS3;
