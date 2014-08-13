require('dotenv').load(); // load environmental variables

var Mocha = require('mocha'),
  fs = require('fs'),
  path = require('path'),
  mocha;

function loadFiles(directory) {
  fs.readdirSync(directory)
    .filter(function (file) { // exclude index.js
      return file !== 'index.js';
    })
    .forEach(function (file) {
      var location, stats;

      location = path.join(directory, file);
      stats = fs.statSync(location);

      if (stats.isDirectory()) {
        loadFiles(location); // traverse directory
      } else if (file.substr(-3) === '.js') { // keep only .js files
        mocha.addFile(location);
      }
    });
}

// init mocha
mocha = new Mocha({
  reporter: 'spec',
  timeout: 10000 // 10 secs
});

// load the test files
loadFiles(__dirname);

// run the tests
mocha.run(function(failures){
  process.on('exit', function () {
    process.exit(failures);
  });
});
