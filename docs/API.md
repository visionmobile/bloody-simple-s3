* [Methods](#methods)
  * [createReadStream([callback])](#createReadStream)

## Methods

### <a name="createReadStream" href="#createReadStream">#</a>createReadStream(path) -> ReadableStream

Creates and returns a readable stream to the designated file on S3.

##### Parameters

* `path` _(string)_ relative file path on S3

##### Example

```javascript
var readable = s3.createReadStream('images/test.png');
// do something with readable stream
```

