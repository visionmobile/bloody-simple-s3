* [Methods](#methods)
  * [createReadStream([callback])](#createReadStream)
  * [writeFileStream(path, readable, [callback])](#writeFileStream)
  * [list(dir, options, [callback])](#list)
  * [copy(source, destination, [callback])](#copy)
  * [move(source, destination, [callback])](#move)
  * [remove(path, [callback])](#remove)
  * [download(path, options, [callback])](#download)
  * [upload(path, options, [callback])](#upload)

## Methods

### <a name="createReadStream" href="#createReadStream">#</a>createReadStream(path) -> ReadableStream

Creates and returns a readable stream to the designated file.

##### Parameters

* `path` _(String)_ relative file path on S3

##### Returns

Readable Stream.

##### Example

```javascript
var readable = s3.createReadStream('images/test.png');
// do something with readable stream
```

### <a name="writeFileStream" href="#writeFileStream">#</a>writeFileStream(path, readable, [callback]) -> Promise

Creates of updates the designated file, consuming a readable stream.

##### Parameters

* `path` _(String)_ relative file path on S3
* `readable` _(ReadableStream)_ a readable file stream to pull file data
* `callback` _(Function)_ optional callback function with (err, file) arguments

##### Returns

A promise resolving to the attributes of the file that was created/updated.

##### Example

```javascript
var readable = fs.createReadStream('/local/dir/test.png');

s3.writeFileStream('images/test.png', readable)
  .then(function (file) {
    // do something on success
  })
  .catch(function (err) {
    console.error(err);
  });
```

### <a name="list" href="#list">#</a>list(dir, options, [callback]) -> Promise

Lists (up to 1000) files in the designated directory.

##### Parameters

* `dir` _(String)_ relative directory path on S3
* `options` _(Object)_ list options
  * `cursor` _(String)_ cursor used for pagination
  * `limit` _(Number)_ maximum number of files; must not exceed 1000
* `callback` _(Function)_ optional callback function with (err, files) arguments

##### Returns

A promise resolving to an array of file attributes.

##### Example

```javascript
s3.list('images/', {limit: 10})
  .then(function (files) {
    files.forEach(function (file, i) {
      console.log(i, file);
    });
  })
  .catch(function (err) {
    console.error(err);
  });
```

### <a name="copy" href="#copy">#</a>copy(source, destination, [callback]) -> Promise

Copies the designated source file to the specified destination.

##### Parameters

* `source` _(String)_ relative source file path on S3
* `destination` _(Object)_ relative destination file path on S3
* `callback` _(Function)_ optional callback function with (err, file) arguments

##### Returns

A promise resolving to the attributes of the file that was copied.

##### Example

```javascript
s3.copy('images/test.png', 'images/tost.png')
  .then(function (file) {
    // do something on success
  })
  .catch(function (err) {
    console.error(err);
  });
```

### <a name="move" href="#move">#</a>move(source, destination, [callback]) -> Promise

Moves the designated file within S3.

##### Parameters

* `source` _(String)_ relative source file path on S3
* `destination` _(Object)_ relative destination file path on S3
* `callback` _(Function)_ optional callback function with (err, file) arguments

##### Returns

A promise resolving to the attributes of the file that was moved.

##### Example

```javascript
s3.move('images/test.png', 'images/test-123.png')
  .then(function (file) {
    // do something on success
  })
  .catch(function (err) {
    console.error(err);
  });
```

### <a name="remove" href="#remove">#</a>remove(path, [callback]) -> Promise

Removes the designated file from S3.

##### Parameters

* `path` _(String)_ relative file path on S3
* `callback` _(Function)_ optional callback function with (err) arguments

##### Returns

A empty promise.

##### Example

```javascript
s3.remove('images/tost.png')
  .then(function () {
    // do something on success
  })
  .catch(function (err) {
    console.error(err);
  });
```

### <a name="download" href="#download">#</a>download(path, options, [callback]) -> Promise

Downloads the designated file from S3 to the local filesystem.

##### Parameters

* `path` _(String)_ relative file path on S3
* `options` _(Object)_ download options
  * `destination` _(String)_ destination file path; defaults to `os.tmpdir()`
* `callback` _(Function)_ optional callback function with (err, localPath) arguments

##### Returns

A promise resolving to the (local) path of the downloaded file.

##### Example

```javascript
s3.download('images/test-123.png', {destination: '/Users/jmike/image.png'})
  .then(function (localPath) {
    console.log(localPath); // prints "/Users/jmike/image.png"
  })
  .catch(function (err) {
    console.error(err);
  });
```

### <a name="upload" href="#upload">#</a>upload(path, options, [callback]) -> Promise

Uploads the designated file from the local filesystem to S3.

##### Parameters

* `path` _(String)_ relative or absolute file path on the local filesystem
* `options` _(Object)_ download options
  * `key` _(String)_ destination file path on S3
* `callback` _(Function)_ optional callback function with (err, file) arguments

##### Returns

A promise resolving to the attributes of the uploaded file.

##### Example

```javascript
s3.upload('/Users/jmike/image.png', {key: 'images/jmike.png'})
  .then(function (file) {
    // do something on success
  })
  .catch(function (err) {
    console.error(err);
  });
```
