/* eslint-env node, mocha */

import fs from 'fs';
import { assert } from 'chai';
import S3 from '../src/BloodySimpleS3';

describe('Bloody Simple S3', () => {
  const s3 = new S3({
    bucket: 'bloody-simple-s3',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sslEnabled: true
  });

  describe('CRUD operation', () => {
    let len = 0;

    it('uploads file to S3', (done) => {
      s3.upload('../assets/soon.jpg', 'images/soon.jpg')
        .then((file) => {
          assert.isObject(file);
          assert.property(file, 'name');
        })
        .then(done)
        .catch(done);
    });

    it('reads metadata from S3', (done) => {
      s3.getFileMeta('images/soon.jpg')
        .then((data) => {
          assert.isObject(data);
        })
        .then(done)
        .catch(done);
    });

    it('lists files in S3', (done) => {
      s3.list('images/')
        .then((files) => {
          assert.isArray(files);
          assert.operator(files.length, '>', 0);

          files.forEach((file) => {
            assert.notStrictEqual(file.name, 'images/');
          });

          // update length
          len = files.length;
        })
        .then(done)
        .catch(done);
    });

    it('copies files within S3', (done) => {
      s3.copy('images/soon.jpg', 'images/sooner.jpg')
        .then((file) => {
          assert.isObject(file);
          assert.property(file, 'name');
          assert.strictEqual(file.name, 'images/sooner.jpg');
        })
        .then(done)
        .catch(done);
    });

    it('lists files in S3 to validate #copy', (done) => {
      s3.list('images/')
        .then((files) => {
          assert.strictEqual(files.length, len + 1);

          // update length
          len = files.length;
        })
        .then(done)
        .catch(done);
    });

    it('removes file from S3', (done) => {
      s3.remove('images/sooner.jpg')
        .then(done)
        .catch(done);
    });

    it('lists files in S3 to validate #remove', (done) => {
      s3.list('images/')
        .then((files) => {
          assert.strictEqual(files.length, len - 1);

          // update length
          len = files.length;
        })
        .then(done)
        .catch(done);
    });

    it('moves file in S3', (done) => {
      s3.move('images/soon.jpg', 'images/soonest.jpg')
        .then((file) => {
          assert.isObject(file);
          assert.property(file, 'name');
        })
        .then(done)
        .catch(done);
    });

    it('download file from S3', (done) => {
      s3.download('images/soonest.jpg')
        .then((file) => {
          assert.isObject(file);
          assert.property(file, 'name');

          // garbage collect
          fs.unlinkSync(file.name);
        })
        .then(done)
        .catch(done);
    });

    it('removes all files from S3', (done) => {
      s3.remove('images/soonest.jpg')
        .then(done)
        .catch(done);
    });
  });
});
