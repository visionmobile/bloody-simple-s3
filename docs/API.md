* [Methods](#methods)
  * [createReadStream([callback])](#createReadStream)
  * [writeFileStream(path, readable, [callback])](#writeFileStream)

## Methods

### <a name="createReadStream" href="#createReadStream">#</a>createReadStream(path) -> ReadableStream

Creates and returns a readable stream to the designated file.

##### Parameters

* `path` _(String)_ relative file path on S3

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
* `callback` _(Function)_ optional callback function with (err, result) arguments

##### Example

```javascript
var readable = fs.createReadStream('/local/dir/test.png');

return s3.writeFileStream('images/test.png', readable)
  .then(function () {
    // do something on success
  })
  .catch(function (err) {
    console.error(err);
  });
```
