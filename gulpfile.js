var path = require('path');
var gulp = require('gulp');
var babel = require('gulp-babel');
var rimraf = require('gulp-rimraf');
var plumber = require('gulp-plumber');

var manifest = require('./package.json');
var src = path.resolve(__dirname, 'src');
var dest = path.resolve(__dirname, path.dirname(manifest.main));

gulp.task('clean', function () {
  return gulp.src(dest, {read: false})
    .pipe(plumber())
    .pipe(rimraf());
});

gulp.task('build', function () {
  return gulp.src(path.join(src, './**/*.js'))
    .pipe(plumber())
    .pipe(babel())
    .pipe(gulp.dest(dest));
});
