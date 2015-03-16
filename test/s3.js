require('dotenv').load(); // load environmental variables

var assert = require('chai').assert;
var fs = require('fs');
var S3 = require('../');

describe('Bloody Simple S3', function () {

  var s3 = new S3({
    bucket: 'bloody-simple-s3',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sslEnabled: true
  });

  describe('CRUD operation', function () {

    var len = 0;

    it('uploads file to S3', function (done) {
      s3.upload('../assets/soon.jpg', {destination: 'images/soon.jpg'})
        .then(function (file) {
          assert.isObject(file);
          assert.property(file, 'path');
          done();
        })
        .catch(done);
    });

    it('lists files in S3', function (done) {
      s3.list('images/')
        .then(function (files) {
          assert.isArray(files);
          assert.operator(files.length, '>', 0);

          // update length
          len = files.length;

          done();
        })
        .catch(done);
    });

    it('copies files within S3', function (done) {
      s3.copy('images/soon.jpg', 'images/sooner.jpg')
        .then(function (file) {
          assert.isObject(file);
          assert.property(file, 'path');
          assert.strictEqual(file.path, 'images/sooner.jpg');

          done();
        })
        .catch(done);
    });

    it('lists files in S3 to validate #copy', function (done) {
      s3.list('images/')
        .then(function (files) {
          assert.strictEqual(files.length, len + 1);

          // update length
          len = files.length;

          done();
        })
        .catch(done);
    });

    it('removes file from S3', function (done) {
      s3.remove('images/sooner.jpg')
        .then(function () {
          done();
        })
        .catch(done);
    });

    it('lists files in S3 to validate #remove', function (done) {
      s3.list('images/')
        .then(function (files) {
          assert.strictEqual(files.length, len - 1);

          // update length
          len = files.length;

          done();
        })
        .catch(done);
    });

    it('moves file in S3', function (done) {
      s3.move('images/soon.jpg', 'images/soonest.jpg')
        .then(function (file) {
          assert.isObject(file);
          assert.property(file, 'path');

          done();
        })
        .catch(done);
    });

    it('download file from S3', function (done) {
      s3.download('images/soonest.jpg')
        .then(function (file) {
          assert.isObject(file);
          assert.property(file, 'path');

          // garbage collect
          fs.unlinkSync(file.path);

          done();
        })
        .catch(done);
    });

    it('removes all files from S3', function (done) {
      s3.remove('images/soonest.jpg')
        .then(function () {
          done();
        })
        .catch(done);
    });

  });

});
