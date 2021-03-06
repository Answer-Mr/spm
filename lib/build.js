var fs = require('fs');
var path = require('path');
var install = require('./client').install;
var extname = path.extname;
var glob = require('glob');
var log = require('./utils/log');
var umi = require('umi');
var gulp = require('gulp');
var spmrc = require('spmrc');
var multipipe = require('multipipe');
var standalonify = require('spm-standalonify');
var $ = require('gulp-load-plugins')({
  config: require('../package.json')
});

module.exports = function(options, cb) {
  var args = umi.buildArgs(options);
  logArgs(args);

  if (args.install) {
    var opt = {
      cwd: args.cwd,
      registry: args.registry
    };
    install(opt, function(err) {
      if (err) return cb(err);
      build(args, cb);
    });
  } else {
    build(args, cb);
  }
};

function build(args, cb) {
  // add package info
  try {
    var pkg = new umi.Package(args.cwd, {
      skip: args.skip || [],
      ignore: args.ignore || [],
      moduleDir: spmrc.get('install.path')
    });
    if (!args.noPkgLog) {
      log.info('package', 'analyse infomation');
      log.info('package', 'dependencies: ' + Object.keys(pkg.dependencies));
      log.info('package', 'files: ' + Object.keys(pkg.files));
    }
    args.pkg = pkg;
  } catch(err) {
    return cb(err);
  }

  // get build files
  var files = getFiles(pkg);
  log.info('output', 'files: ' + files);

  // check duplicate pkgs
  checkDuplicate(files, pkg);

  // build package in dependencies
  var depFiles = {};
  if (args.withDeps) {
    var depPkgs = getAllDependencies(pkg);
    for (var id in depPkgs) {
      files = files.concat(getFiles(depPkgs[id]).map(function(f) {
        var filepath = spmrc.get('install.path') + '/' + id.replace('@','/') + '/' + f;
        depFiles[filepath] = depPkgs[id].files[f];
        return filepath;
      }));
    }
    log.info('withDeps', 'files: ' + files);
  }

  // check ext deps and install
  if (!args.noExtCheck) {
    var extDeps = getExtDeps(files, pkg, depFiles);
    if (extDeps.length) {
      log.info('extDeps', extDeps.join(','));
    }
    if (extDeps.length) {
      return install({
        cwd: args.cwd,
        save: true,
        name: extDeps
      }, function(err) {
        if (err) {
          return cb(err);
        }
        args.noExtCheck = args.noPkgLog = true;
        build(args, cb);
      });
    }
  }

  // define task
  defineCleanTask(args);
  defineBuildTask(files, args);

  gulp
  .on('task_start', function(e) {showLog('start', e);})
  .on('task_stop', function(e) {showLog('end', e);})
  .on('task_err', function(e) {cb(e.err);})
  .on('err', function(e) {cb(e.err);});

  gulp.start('build', cb);
}

function getFiles(pkg) {
  var files = [];

  if (fs.existsSync(path.join(pkg.dest, pkg.main))) {
    files.push(pkg.main);
  }

  if (Array.isArray(pkg.output) && pkg.output.length) {
    pkg.output.forEach(function (outputGlob) {
      var items = glob.sync(outputGlob, {cwd: pkg.dest});
      files = files.concat(items);
    });
  }

  return files
    .filter(function(item, index, arr) {
      return index === arr.indexOf(item);
    });
}

function defineBuildTask(files, args) {
  gulp.task('build', ['clean'], buildFiles(files, args));
}

function getAllDependencies(pkg) {
  var result = {};
  recurseDependencies(pkg);
  return result;

  function recurseDependencies(pkg) {
    Object.keys(pkg.dependencies).forEach(function(key) {
      var id = pkg.dependencies[key].id;
      if (!result[id]) {
        result[id] = pkg.dependencies[key];
        recurseDependencies(pkg.dependencies[key]);
      }
    });
  }
}

function buildFiles(files, args) {
  var beautifyOpt = {indent_size: 2, preserve_newlines: false};

  var isStandalone;
  if (args.include === 'standalone') {
    isStandalone = true;
    args.include = 'all';
  }
  if (args.include === 'umd') {
    isStandalone = true;
    args.include = 'all';
    // use package name as global name for umd
    args.umd = camelCase(args.pkg.name);
  }

  var opt = umi.util.extendOption(args);
  var optDebug = umi.util.extendOption(args);
  optDebug.rename = {'suffix': '-debug'};

  return function() {
    return pipe(
      gulp.src(files, {cwd:opt.cwd,base:opt.cwd}),

      // only transport css and js files
      $.if(isCSSorJS, $.mirror(

        // normal
        pipe(
          $.transport(opt),
          $.if(isJS, pipe(
            $.if(isStandalone, standalonify(args)),
            $.uglify({
              output: {
                ascii_only: true
              }
            })
          ), $.cssmin()),
          $.size2({
            gzip: true,
            showFiles: true,
            log: function(title, what, size) {
              size = ((size/1024.0).toFixed(2) + 'kB').to.magenta;
              log.info('size', what + ' ' + size + ' (gzipped)'.to.gray);
            }
          })
        ),

        // debug
        pipe(
          $.transport(optDebug),
          $.if(isJS, pipe(
            $.if(isStandalone, standalonify(args)),
            $.jsbeautify(beautifyOpt)
          ))
        )
      )),

      // transport path and output files
      $.transport.plugin.dest(opt),
      gulp.dest(args.dest),

      // zip files
      $.if(args.zip, pipe(
        $.zip('archive.zip'),
        gulp.dest(args.dest)
      ))
    );
  };

  function isJS(file) {
    return extname(file.path) === '.js';
  }
  function isCSSorJS(file) {
    return extname(file.path) === '.js' ||
      extname(file.path) === '.css';
  }
}

function defineCleanTask(args) {
  gulp.task('clean', function() {
    return args.force && gulp.src(args.dest)
      .pipe($.clean({force: true}));
  });
}

function logArgs(args) {
  Object.keys(args)
    .forEach(function(key) {
      log.info('arguments', key + ' = ' + args[key]);
    });
}

function showLog(type, e) {
  var info = 'task ' + e.task;
  if (type === 'end') info = info.to.green.color;
  log.info(type, info);
}

function pipe() {
  return multipipe.apply(null, arguments)
    .on('data', function() {});
}

function checkDuplicate(files, pkg) {
  var rootPkgName = pkg.name;

  files.forEach(function(f) {
    var dup = {};
    var file = pkg.files[f];

    file.lookup(function(fileInfo) {
      var name = fileInfo.pkg.name;
      var version = fileInfo.pkg.version;
      if (name === rootPkgName) return;
      dup[name] = dup[name] || {};
      dup[name][version] = true;
    });

    for (var k in dup) {
      var versions = Object.keys(dup[k]);
      if (versions.length > 1) {
        log.warn('dulplicate',
          '%s (%s) while building %s'.to.yellow.color,
          k,
          versions.join(', '),
          file.path
        );
      }
    }
  });
}

function getExtDeps(files, pkg, depFiles) {
  var extDeps = {};
  files.forEach(function(f) {
    if (path.extname(f) !== '.js') return;
    var file = depFiles[f] || pkg.files[f];
    if (!file) return;
    if (!pkg.dependencies['import-style'] && file.hasExt('css')) {
      extDeps['import-style'] = true;
    }
    if (!pkg.dependencies['handlebars-runtime'] && file.hasExt('handlebars')) {
      extDeps['handlebars-runtime'] = true;
    }
  });
  return Object.keys(extDeps);
}

function camelCase(str) {
  return str.replace(/[_.-](\w|$)/g, function (_,x) {
    return x.toUpperCase();
  });
}
