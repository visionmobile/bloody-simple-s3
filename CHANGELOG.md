## 0.3.4 - 2015-04-23

* Update aws-sdk to v.2.1.24

## 0.3.3 - 2015-04-16

* Set cursor=dir by default as a smarter way to filter our dir references from the #list() results

## 0.3.2 - 2015-04-16

* Remove self reference to the dir on #list(dir)

## 0.3.1 - 2015-04-06

* Add #readBuffer method to read the contents of a file from S3

## 0.3.0 - 2015-04-03

* Add #rename as alias of #move

## 0.3.0-alpha - 2015-03-16

* Refactor to provide a consistent API

## 0.2.5 - 2015-03-13

* Refactor to match the Airbnb JS guidelines
* Update npm dependencies to their latest version

## 0.2.4 - 2014-11-28

* Use #encodeURIComponent() instead of #encodeURI() to encode @CopySource

## 0.2.3 - 2014-11-28

* Comment test code that wasn't supposed to be there

## 0.2.2 - 2014-11-28

* Normalize promise resolve values

## 0.2.1 - 2014-11-28

* Allow limit and cursor options on #list()

## 0.2.0 - 2014-11-27

* Introducing #list(), #copy(), #remove(), #move() methods to manipulate files on Amazon S3
* Old functions refactored with new names and params
