const path = require('path');
const gulp = require('gulp');
const babel = require('gulp-babel');
const rimraf = require('gulp-rimraf');
const plumber = require('gulp-plumber');
const manifest = require('./package.json');

const src = path.resolve(__dirname, 'src');
const dest = path.resolve(__dirname, path.dirname(manifest.main));

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
