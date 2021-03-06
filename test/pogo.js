(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json",".pogo"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/lib/terms/argumentList.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(args) {
                var self = this;
                self.isArgumentList = true;
                return self.args = args;
            },
            arguments: function() {
                var self = this;
                return self.args;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/argumentUtils.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return {
            asyncifyArguments: function(arguments, optionalArguments) {
                var self = this;
                var gen1_items, gen2_i, arg, gen3_items, gen4_i, optArg;
                gen1_items = arguments;
                for (gen2_i = 0; gen2_i < gen1_items.length; ++gen2_i) {
                    arg = gen1_items[gen2_i];
                    arg.asyncify();
                }
                gen3_items = optionalArguments;
                for (gen4_i = 0; gen4_i < gen3_items.length; ++gen4_i) {
                    optArg = gen3_items[gen4_i];
                    optArg.asyncify();
                }
                return void 0;
            },
            asyncifyBody: function(body, args) {
                var self = this;
                var closure;
                if (body) {
                    closure = terms.closure(args || [], body);
                    closure.asyncify();
                    return closure;
                } else {
                    return terms.nil();
                }
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/asyncArgument.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function() {
                var self = this;
                return self.isAsyncArgument = true;
            },
            arguments: function() {
                var self = this;
                return [];
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/asyncCallback.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var asyncCallback;
        return asyncCallback = function(body, gen1_options) {
            var resultVariable;
            resultVariable = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "resultVariable") && gen1_options.resultVariable !== void 0 ? gen1_options.resultVariable : void 0;
            var errorVariable, catchErrorVariable;
            errorVariable = terms.generatedVariable([ "error" ]);
            catchErrorVariable = terms.generatedVariable([ "exception" ]);
            if (!body.containsContinuation()) {
                body.rewriteResultTermInto(function(term) {
                    if (!term.originallyAsync) {
                        return terms.functionCall(terms.callbackFunction, [ terms.nil(), term ]);
                    } else {
                        return term;
                    }
                }, {
                    async: true
                });
            }
            return terms.closure([ errorVariable, resultVariable ], terms.statements([ terms.ifExpression([ {
                condition: errorVariable,
                body: terms.statements([ terms.functionCall(terms.callbackFunction, [ errorVariable ]) ])
            } ], terms.statements([ terms.tryExpression(body, {
                catchParameter: catchErrorVariable,
                catchBody: terms.statements([ terms.functionCall(terms.callbackFunction, [ catchErrorVariable ]) ])
            }) ])) ]), {
                returnLastStatement: false
            });
        };
    };
}).call(this);
});

require.define("/lib/terms/asyncResult.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var asyncResult;
        return asyncResult = function() {
            var resultVariable;
            resultVariable = terms.generatedVariable([ "async", "result" ]);
            resultVariable.isAsyncResult = true;
            return resultVariable;
        };
    };
}).call(this);
});

require.define("/lib/terms/asyncStatements.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, codegenUtils, statementsUtils;
    _ = require("underscore");
    codegenUtils = require("./codegenUtils");
    statementsUtils = require("./statementsUtils");
    module.exports = function(terms) {
        var self = this;
        var createCallbackWithStatements, putStatementsInCallbackForNextAsyncCall, asyncStatements;
        createCallbackWithStatements = function(callbackStatements, gen1_options) {
            var resultVariable, forceAsync, global, containsContinuation;
            resultVariable = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "resultVariable") && gen1_options.resultVariable !== void 0 ? gen1_options.resultVariable : void 0;
            forceAsync = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "forceAsync") && gen1_options.forceAsync !== void 0 ? gen1_options.forceAsync : false;
            global = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "global") && gen1_options.global !== void 0 ? gen1_options.global : false;
            containsContinuation = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "containsContinuation") && gen1_options.containsContinuation !== void 0 ? gen1_options.containsContinuation : containsContinuation;
            var errorVariable, asyncStmts;
            if (callbackStatements.length === 1 && callbackStatements[0].isAsyncResult) {
                if (containsContinuation) {
                    errorVariable = terms.generatedVariable([ "error" ]);
                    return terms.closure([ errorVariable ], terms.statements([ terms.ifExpression([ {
                        condition: errorVariable,
                        body: terms.statements([ terms.functionCall(terms.callbackFunction, [ errorVariable ]) ])
                    } ]) ]));
                } else {
                    return terms.callbackFunction;
                }
            } else {
                asyncStmts = putStatementsInCallbackForNextAsyncCall(callbackStatements, {
                    forceAsync: forceAsync,
                    forceNotAsync: true,
                    global: global
                });
                return terms.asyncCallback(asyncStmts, {
                    resultVariable: resultVariable
                });
            }
        };
        putStatementsInCallbackForNextAsyncCall = function(statements, gen2_options) {
            var forceAsync, forceNotAsync, global;
            forceAsync = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "forceAsync") && gen2_options.forceAsync !== void 0 ? gen2_options.forceAsync : false;
            forceNotAsync = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "forceNotAsync") && gen2_options.forceNotAsync !== void 0 ? gen2_options.forceNotAsync : false;
            global = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "global") && gen2_options.global !== void 0 ? gen2_options.global : false;
            var containsContinuation, n, gen3_forResult;
            containsContinuation = function() {
                if (statements.length > 0) {
                    return function() {
                        var gen4_results, gen5_items, gen6_i, stmt;
                        gen4_results = [];
                        gen5_items = statements;
                        for (gen6_i = 0; gen6_i < gen5_items.length; ++gen6_i) {
                            stmt = gen5_items[gen6_i];
                            gen4_results.push(stmt.containsContinuation());
                        }
                        return gen4_results;
                    }().reduce(function(l, r) {
                        return l || r;
                    });
                } else {
                    return false;
                }
            }();
            for (n = 0; n < statements.length; ++n) {
                gen3_forResult = void 0;
                if (function(n) {
                    var statement, asyncStatement, firstStatements;
                    statement = statements[n];
                    asyncStatement = statement.makeAsyncWithCallbackForResult(function(resultVariable) {
                        return createCallbackWithStatements(statements.slice(n + 1), {
                            resultVariable: resultVariable,
                            forceAsync: forceAsync,
                            global: global,
                            containsContinuation: containsContinuation
                        });
                    });
                    if (asyncStatement) {
                        firstStatements = statements.slice(0, n);
                        firstStatements.push(asyncStatement);
                        gen3_forResult = terms.statements(firstStatements, {
                            async: true && !forceNotAsync
                        });
                        return true;
                    }
                }(n)) {
                    return gen3_forResult;
                }
            }
            return terms.statements(statements, {
                global: global,
                async: forceAsync
            });
        };
        return asyncStatements = function(statements, gen7_options) {
            var forceAsync, global;
            forceAsync = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "forceAsync") && gen7_options.forceAsync !== void 0 ? gen7_options.forceAsync : false;
            global = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "global") && gen7_options.global !== void 0 ? gen7_options.global : false;
            var serialisedStatements;
            serialisedStatements = statementsUtils.serialiseStatements(statements);
            return putStatementsInCallbackForNextAsyncCall(serialisedStatements, {
                forceAsync: forceAsync,
                global: global
            });
        };
    };
}).call(this);
});

require.define("/node_modules/underscore/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/underscore/underscore.js",function(require,module,exports,__dirname,__filename,process,global){//     Underscore.js 1.4.2
//     http://underscorejs.org
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var push             = ArrayProto.push,
      slice            = ArrayProto.slice,
      concat           = ArrayProto.concat,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.4.2';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return arguments.length > 2 ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // with specific `key:value` pairs.
  _.where = function(obj, attrs) {
    if (_.isEmpty(attrs)) return [];
    return _.filter(obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See: https://bugs.webkit.org/show_bug.cgi?id=80797
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (obj.length === +obj.length) return slice.call(obj);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    each(input, function(value) {
      if (_.isArray(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(concat.apply(ArrayProto, arguments));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(args, "" + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more, result;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) {
          result = func.apply(context, args);
        }
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        throttling = true;
        result = func.apply(context, args);
      }
      whenDone();
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent, but `Object`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                               _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
        return false;
      }
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return _.isNumber(obj) && isFinite(obj);
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + (0 | Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });
      source +=
        escape ? "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'" :
        interpolate ? "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'" :
        evaluate ? "';\n" + evaluate + "\n__p+='" : '';
      index = offset + match.length;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      var render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

});

require.define("/lib/terms/codegenUtils.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, actualCharacters, nameSegmentRenderedInJavaScript, operatorRenderedInJavaScript, capitalise, reservedWords, escapeReservedWord;
    _ = require("underscore");
    exports.writeToBufferWithDelimiter = function(array, delimiter, buffer, scope) {
        var self = this;
        var writer, first;
        writer = void 0;
        if (scope instanceof Function) {
            writer = scope;
        } else {
            writer = function(item) {
                return item.generateJavaScript(buffer, scope);
            };
        }
        first = true;
        return _(array).each(function(item) {
            if (!first) {
                buffer.write(delimiter);
            }
            first = false;
            return writer(item);
        });
    };
    actualCharacters = [ [ /\\/g, "\\\\" ], [ new RegExp("\b"), "\\b" ], [ /\f/g, "\\f" ], [ /\n/g, "\\n" ], [ /\0/g, "\\0" ], [ /\r/g, "\\r" ], [ /\t/g, "\\t" ], [ /\v/g, "\\v" ], [ /'/g, "\\'" ], [ /"/g, '\\"' ] ];
    exports.formatJavaScriptString = function(s) {
        var self = this;
        var gen1_items, gen2_i, mapping;
        gen1_items = actualCharacters;
        for (gen2_i = 0; gen2_i < gen1_items.length; ++gen2_i) {
            mapping = gen1_items[gen2_i];
            s = s.replace(mapping[0], mapping[1]);
        }
        return "'" + s + "'";
    };
    exports.concatName = function(nameSegments, options) {
        var self = this;
        var name, n, segment;
        name = "";
        for (n = 0; n < nameSegments.length; ++n) {
            segment = nameSegments[n];
            name = name + nameSegmentRenderedInJavaScript(segment, n === 0);
        }
        if (options && options.hasOwnProperty("escape") && options.escape) {
            return escapeReservedWord(name);
        } else {
            return name;
        }
    };
    nameSegmentRenderedInJavaScript = function(nameSegment, isFirst) {
        if (/[_$a-zA-Z0-9]+/.test(nameSegment)) {
            if (isFirst) {
                return nameSegment;
            } else {
                return capitalise(nameSegment);
            }
        } else {
            return operatorRenderedInJavaScript(nameSegment);
        }
    };
    operatorRenderedInJavaScript = function(operator) {
        var javaScriptName, n;
        javaScriptName = "";
        for (n = 0; n < operator.length; ++n) {
            javaScriptName = javaScriptName + "$" + operator.charCodeAt(n).toString(16);
        }
        return javaScriptName;
    };
    capitalise = function(s) {
        return s[0].toUpperCase() + s.substring(1);
    };
    reservedWords = {
        "class": true,
        "function": true,
        "else": true,
        "case": true,
        "switch": true
    };
    escapeReservedWord = function(word) {
        if (reservedWords.hasOwnProperty(word)) {
            return "$" + word;
        } else {
            return word;
        }
    };
    exports.concatArgs = function(args, gen3_options) {
        var self = this;
        var optionalArgs, asyncCallbackArg, terms;
        optionalArgs = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "optionalArgs") && gen3_options.optionalArgs !== void 0 ? gen3_options.optionalArgs : void 0;
        asyncCallbackArg = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "asyncCallbackArg") && gen3_options.asyncCallbackArg !== void 0 ? gen3_options.asyncCallbackArg : void 0;
        terms = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "terms") && gen3_options.terms !== void 0 ? gen3_options.terms : void 0;
        var a;
        a = args.slice();
        if (optionalArgs && optionalArgs.length > 0) {
            a.push(terms.hash(optionalArgs));
        }
        if (asyncCallbackArg) {
            a.push(asyncCallbackArg);
        }
        return a;
    };
    exports.normaliseOperatorName = function(name) {
        var self = this;
        var match;
        match = /^@([a-z_$]+)$/i.exec(name);
        if (match) {
            return match[1];
        } else {
            return name;
        }
    };
    exports.declaredVariables = function(scope) {
        var self = this;
        return {
            variables: [],
            scope: scope,
            declare: function(variable) {
                var self = this;
                scope.define(variable);
                return self.variables.push(variable);
            },
            isDeclared: function(variable) {
                var self = this;
                return scope.isDefined(variable);
            },
            uniqueVariables: function() {
                var self = this;
                return _.uniq(self.variables);
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/statementsUtils.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    exports.serialiseStatements = function(statements) {
        var self = this;
        var serialisedStatements, n, statement;
        serialisedStatements = [];
        for (n = 0; n < statements.length; ++n) {
            statement = statements[n].rewrite({
                rewrite: function(term, gen1_options) {
                    var rewrite;
                    rewrite = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "rewrite") && gen1_options.rewrite !== void 0 ? gen1_options.rewrite : void 0;
                    return term.serialiseSubStatements(serialisedStatements, {
                        rewrite: rewrite
                    });
                },
                limit: function(term) {
                    return term.isStatements;
                }
            });
            serialisedStatements.push(statement);
        }
        return serialisedStatements;
    };
}).call(this);
});

require.define("/lib/terms/boolean.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(cg) {
        var self = this;
        return cg.term({
            constructor: function(value) {
                var self = this;
                self.boolean = value;
                return self.isBoolean = true;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                if (self.boolean) {
                    return buffer.write("true");
                } else {
                    return buffer.write("false");
                }
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/breakStatement.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function() {
                var self = this;
                return self.isBreak = true;
            },
            generateJavaScriptStatement: function(buffer, scope) {
                var self = this;
                return buffer.write("break;");
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                return self;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/closure.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, codegenUtils, blockParameters, selfParameter, splatParameters, parseSplatParameters, takeFromWhile;
    _ = require("underscore");
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        var optionalParameters, optional, asyncParameters, containsSplatParameter, createSplatParameterStrategyFor, createOptionalParameterStrategyFor;
        optionalParameters = function(optionalParameters, next) {
            if (optionalParameters.length > 0) {
                return {
                    options: terms.generatedVariable([ "options" ]),
                    parameters: function() {
                        var self = this;
                        return next.parameters().concat([ self.options ]);
                    },
                    statements: function() {
                        var self = this;
                        var optionalStatements;
                        optionalStatements = _.map(optionalParameters, function(parm) {
                            return terms.definition(terms.variable(parm.field), optional(self.options, parm.field, parm.value), {
                                shadow: true
                            });
                        });
                        return optionalStatements.concat(next.statements());
                    },
                    hasOptionals: true
                };
            } else {
                return next;
            }
        };
        optional = terms.term({
            constructor: function(options, name, defaultValue) {
                var self = this;
                self.options = options;
                self.name = name;
                return self.defaultValue = defaultValue;
            },
            properDefaultValue: function() {
                var self = this;
                if (self.defaultValue === void 0) {
                    return terms.variable([ "undefined" ]);
                } else {
                    return self.defaultValue;
                }
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("(");
                self.options.generateJavaScript(buffer, scope);
                buffer.write("&&");
                self.options.generateJavaScript(buffer, scope);
                buffer.write(".hasOwnProperty('" + codegenUtils.concatName(self.name) + "')&&");
                self.options.generateJavaScript(buffer, scope);
                buffer.write("." + codegenUtils.concatName(self.name) + "!==void 0)?");
                self.options.generateJavaScript(buffer, scope);
                buffer.write("." + codegenUtils.concatName(self.name) + ":");
                return self.properDefaultValue().generateJavaScript(buffer, scope);
            }
        });
        asyncParameters = function(closure, next) {
            return {
                parameters: function() {
                    var self = this;
                    if (closure.isAsync) {
                        return next.parameters().concat([ terms.callbackFunction ]);
                    } else {
                        return next.parameters();
                    }
                },
                statements: function() {
                    var self = this;
                    return next.statements();
                }
            };
        };
        containsSplatParameter = function(closure) {
            return _.any(closure.parameters, function(parameter) {
                return parameter.isSplat;
            });
        };
        createSplatParameterStrategyFor = function(closure) {
            var nonSplatParams, before, splat, after;
            nonSplatParams = takeFromWhile(closure.parameters, function(parameter) {
                return !parameter.isSplat;
            });
            before = nonSplatParams.slice(0, nonSplatParams.length - 1);
            splat = nonSplatParams[nonSplatParams.length - 1];
            after = closure.parameters.slice(nonSplatParams.length + 1);
            return terms.closureParameterStrategies.splatStrategy({
                before: before,
                splat: splat,
                after: after
            });
        };
        createOptionalParameterStrategyFor = function(closure) {
            return terms.closureParameterStrategies.optionalStrategy({
                before: closure.parameters,
                options: closure.optionalParameters
            });
        };
        return terms.term({
            constructor: function(parameters, body, gen1_options) {
                var self = this;
                var optionalParameters, returnLastStatement, redefinesSelf, async;
                optionalParameters = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "optionalParameters") && gen1_options.optionalParameters !== void 0 ? gen1_options.optionalParameters : [];
                returnLastStatement = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "returnLastStatement") && gen1_options.returnLastStatement !== void 0 ? gen1_options.returnLastStatement : true;
                redefinesSelf = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "redefinesSelf") && gen1_options.redefinesSelf !== void 0 ? gen1_options.redefinesSelf : false;
                async = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "async") && gen1_options.async !== void 0 ? gen1_options.async : false;
                self.isBlock = true;
                self.isClosure = true;
                self.parameters = parameters;
                self.body = body;
                self.redefinesSelf = redefinesSelf;
                self.optionalParameters = optionalParameters;
                self.isAsync = async || body.isAsync;
                return self.returnLastStatement = returnLastStatement;
            },
            blockify: function(parameters, gen2_options) {
                var self = this;
                var optionalParameters, async;
                optionalParameters = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "optionalParameters") && gen2_options.optionalParameters !== void 0 ? gen2_options.optionalParameters : [];
                async = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "async") && gen2_options.async !== void 0 ? gen2_options.async : false;
                self.parameters = parameters;
                self.optionalParameters = optionalParameters;
                self.isAsync = self.isAsync || async;
                return self;
            },
            scopify: function() {
                var self = this;
                if (self.parameters.length === 0 && self.optionalParameters.length === 0) {
                    if (self.isAsync) {
                        return terms.functionCall(terms.subExpression(self), [], {
                            async: true
                        });
                    } else {
                        return terms.scope(self.body.statements, {
                            async: self.isAsync
                        });
                    }
                } else {
                    return self;
                }
            },
            parameterTransforms: function() {
                var self = this;
                var optionals, async, splat;
                if (self._parameterTransforms) {
                    return self._parameterTransforms;
                }
                optionals = optionalParameters(self.optionalParameters, selfParameter(terms, self.redefinesSelf, blockParameters(self)));
                async = asyncParameters(self, optionals);
                splat = splatParameters(terms, async);
                if (optionals.hasOptionals && splat.hasSplat) {
                    terms.errors.addTermsWithMessage(self.optionalParameters, "cannot have splat parameters with optional parameters");
                }
                return self._parameterTransforms = splat;
            },
            transformedStatements: function() {
                var self = this;
                return terms.statements(self.parameterTransforms().statements());
            },
            transformedParameters: function() {
                var self = this;
                return self.parameterTransforms().parameters();
            },
            declareParameters: function(scope, parameters) {
                var self = this;
                var gen3_items, gen4_i, parameter;
                gen3_items = parameters;
                for (gen4_i = 0; gen4_i < gen3_items.length; ++gen4_i) {
                    parameter = gen3_items[gen4_i];
                    scope.define(parameter.canonicalName(scope));
                }
                return void 0;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                var parametersStrategy, parameters, bodyScope;
                parametersStrategy = self.parametersStrategy();
                self.rewriteResultTermToReturn();
                buffer.write("function(");
                parameters = parametersStrategy.namedParameters();
                parametersStrategy.generateJavaScriptParameters(buffer, scope);
                buffer.write("){");
                bodyScope = scope.subScope();
                self.declareParameters(bodyScope, parameters);
                self.generateSelfAssignment(buffer);
                parametersStrategy.generateJavaScriptParameterStatements(buffer, scope, terms.variable([ "arguments" ]));
                self.body.generateJavaScriptStatements(buffer, bodyScope, {
                    inClosure: true
                });
                return buffer.write("}");
            },
            generateSelfAssignment: function(buffer) {
                var self = this;
                if (self.redefinesSelf) {
                    return buffer.write("var self=this;");
                }
            },
            rewriteResultTermToReturn: function() {
                var self = this;
                if (self.returnLastStatement && !self.body.isAsync) {
                    return self.body.rewriteLastStatementToReturn({
                        async: self.isAsync
                    });
                }
            },
            asyncify: function() {
                var self = this;
                self.body.asyncify();
                return self.isAsync = true;
            },
            parametersStrategy: function() {
                var self = this;
                var innerStrategy, strategy;
                innerStrategy = function() {
                    if (containsSplatParameter(self)) {
                        return createSplatParameterStrategyFor(self);
                    } else if (self.optionalParameters.length > 0) {
                        return createOptionalParameterStrategyFor(self);
                    } else {
                        return terms.closureParameterStrategies.normalStrategy(self.parameters);
                    }
                }();
                strategy = function() {
                    if (self.isAsync) {
                        return terms.closureParameterStrategies.callbackStrategy(innerStrategy);
                    } else {
                        return innerStrategy;
                    }
                }();
                return terms.closureParameterStrategies.functionStrategy(strategy);
            }
        });
    };
    blockParameters = function(block) {
        return {
            parameters: function() {
                var self = this;
                return block.parameters;
            },
            statements: function() {
                var self = this;
                return block.body.statements;
            }
        };
    };
    selfParameter = function(cg, redefinesSelf, next) {
        if (redefinesSelf) {
            return {
                parameters: function() {
                    var self = this;
                    return next.parameters();
                },
                statements: function() {
                    var self = this;
                    return [ cg.definition(cg.selfExpression(), cg.variable([ "this" ]), {
                        shadow: true
                    }) ].concat(next.statements());
                }
            };
        } else {
            return next;
        }
    };
    splatParameters = function(cg, next) {
        var parsedSplatParameters;
        parsedSplatParameters = parseSplatParameters(cg, next.parameters());
        return {
            parameters: function() {
                var self = this;
                return parsedSplatParameters.firstParameters;
            },
            statements: function() {
                var self = this;
                var splat, lastIndex, splatParameter, lastParameterStatements, n, param;
                splat = parsedSplatParameters;
                if (splat.splatParameter) {
                    lastIndex = "arguments.length";
                    if (splat.lastParameters.length > 0) {
                        lastIndex = lastIndex + " - " + splat.lastParameters.length;
                    }
                    splatParameter = cg.definition(splat.splatParameter, cg.javascript("Array.prototype.slice.call(arguments, " + splat.firstParameters.length + ", " + lastIndex + ")"), {
                        shadow: true
                    });
                    lastParameterStatements = [ splatParameter ];
                    for (n = 0; n < splat.lastParameters.length; ++n) {
                        param = splat.lastParameters[n];
                        lastParameterStatements.push(cg.definition(param, cg.javascript("arguments[arguments.length - " + (splat.lastParameters.length - n) + "]"), {
                            shadow: true
                        }));
                    }
                    return lastParameterStatements.concat(next.statements());
                } else {
                    return next.statements();
                }
            },
            hasSplat: parsedSplatParameters.splatParameter
        };
    };
    parseSplatParameters = module.exports.parseSplatParameters = function(cg, parameters) {
        var self = this;
        var firstParameters, maybeSplat, splatParam, lastParameters;
        firstParameters = takeFromWhile(parameters, function(param) {
            return !param.isSplat;
        });
        maybeSplat = parameters[firstParameters.length];
        splatParam = void 0;
        lastParameters = void 0;
        if (maybeSplat && maybeSplat.isSplat) {
            splatParam = firstParameters.pop();
            splatParam.shadow = true;
            lastParameters = parameters.slice(firstParameters.length + 2);
            lastParameters = _.filter(lastParameters, function(param) {
                if (param.isSplat) {
                    cg.errors.addTermWithMessage(param, "cannot have more than one splat parameter");
                    return false;
                } else {
                    return true;
                }
            });
        } else {
            lastParameters = [];
        }
        return {
            firstParameters: firstParameters,
            splatParameter: splatParam,
            lastParameters: lastParameters
        };
    };
    takeFromWhile = function(list, canTake) {
        var takenList, gen5_items, gen6_i, gen7_forResult;
        takenList = [];
        gen5_items = list;
        for (gen6_i = 0; gen6_i < gen5_items.length; ++gen6_i) {
            gen7_forResult = void 0;
            if (function(gen6_i) {
                var item;
                item = gen5_items[gen6_i];
                if (canTake(item)) {
                    takenList.push(item);
                } else {
                    gen7_forResult = takenList;
                    return true;
                }
            }(gen6_i)) {
                return gen7_forResult;
            }
        }
        return takenList;
    };
}).call(this);
});

require.define("/lib/terms/closureParameterStrategies.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, codegenUtils;
    _ = require("underscore");
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return {
            functionStrategy: function(strategy) {
                var self = this;
                return {
                    strategy: strategy,
                    generateJavaScriptParameters: function(buffer, scope) {
                        var self = this;
                        return codegenUtils.writeToBufferWithDelimiter(self.strategy.namedParameters(), ",", buffer, scope);
                    },
                    generateJavaScriptParameterStatements: function(buffer, scope, args) {
                        var self = this;
                        return self.strategy.generateJavaScriptParameterStatements(buffer, scope, args);
                    },
                    namedParameters: function() {
                        var self = this;
                        return strategy.namedParameters();
                    }
                };
            },
            normalStrategy: function(parameters) {
                var self = this;
                return {
                    parameters: parameters,
                    namedParameters: function() {
                        var self = this;
                        return self.parameters;
                    },
                    generateJavaScriptParameterStatements: function(buffer, scope, args) {
                        var self = this;
                        return void 0;
                    }
                };
            },
            splatStrategy: function(gen1_options) {
                var self = this;
                var before, splat, after;
                before = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "before") && gen1_options.before !== void 0 ? gen1_options.before : void 0;
                splat = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "splat") && gen1_options.splat !== void 0 ? gen1_options.splat : void 0;
                after = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "after") && gen1_options.after !== void 0 ? gen1_options.after : void 0;
                return {
                    before: before,
                    splat: splat,
                    after: after,
                    namedParameters: function() {
                        var self = this;
                        return self.before;
                    },
                    generateJavaScriptParameterStatements: function(buffer, scope, args) {
                        var self = this;
                        var n, afterArg, argsIndex;
                        buffer.write("var ");
                        self.splat.generateJavaScript(buffer, scope);
                        buffer.write("=Array.prototype.slice.call(");
                        args.generateJavaScript(buffer, scope);
                        buffer.write("," + self.before.length + ",");
                        args.generateJavaScript(buffer, scope);
                        buffer.write(".length");
                        if (self.after.length > 0) {
                            buffer.write("-" + self.after.length);
                        }
                        buffer.write(");");
                        if (before.length > 0 && after.length > 0) {
                            buffer.write("if(");
                            args.generateJavaScript(buffer, scope);
                            buffer.write(".length>" + before.length + "){");
                        }
                        for (n = 0; n < self.after.length; ++n) {
                            afterArg = self.after[n];
                            argsIndex = self.after.length - n;
                            buffer.write("var ");
                            afterArg.generateJavaScript(buffer, scope);
                            buffer.write("=");
                            args.generateJavaScript(buffer, scope);
                            buffer.write("[");
                            args.generateJavaScript(buffer, scope);
                            buffer.write(".length-" + argsIndex + "];");
                        }
                        if (before.length > 0 && after.length > 0) {
                            return buffer.write("}");
                        }
                    }
                };
            },
            optionalStrategy: function(gen2_options) {
                var self = this;
                var before, options;
                before = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "before") && gen2_options.before !== void 0 ? gen2_options.before : void 0;
                options = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "options") && gen2_options.options !== void 0 ? gen2_options.options : void 0;
                return {
                    before: before,
                    options: options,
                    optionsVariable: terms.generatedVariable([ "options" ]),
                    namedParameters: function() {
                        var self = this;
                        return self.before.concat([ self.optionsVariable ]);
                    },
                    generateJavaScriptParameterStatements: function(buffer, scope, args) {
                        var self = this;
                        var optionNames, gen3_items, gen4_i, option, optionName;
                        optionNames = _.map(self.options, function(option) {
                            return codegenUtils.concatName(option.field);
                        });
                        buffer.write("var ");
                        buffer.write(optionNames.join(","));
                        buffer.write(";");
                        gen3_items = self.options;
                        for (gen4_i = 0; gen4_i < gen3_items.length; ++gen4_i) {
                            option = gen3_items[gen4_i];
                            optionName = codegenUtils.concatName(option.field);
                            buffer.write(optionName + "=");
                            self.optionsVariable.generateJavaScript(buffer, scope);
                            buffer.write("!==void 0&&Object.prototype.hasOwnProperty.call(");
                            self.optionsVariable.generateJavaScript(buffer, scope);
                            buffer.write(",'" + optionName + "')&&");
                            self.optionsVariable.generateJavaScript(buffer, scope);
                            buffer.write("." + optionName + "!==void 0?");
                            self.optionsVariable.generateJavaScript(buffer, scope);
                            buffer.write("." + optionName + ":");
                            option.value.generateJavaScript(buffer, scope);
                            buffer.write(";");
                        }
                        return void 0;
                    }
                };
            },
            callbackStrategy: function(strategy) {
                var self = this;
                return {
                    strategy: strategy,
                    namedParameters: function() {
                        var self = this;
                        return self.strategy.namedParameters().concat(terms.callbackFunction);
                    },
                    generateJavaScriptParameterStatements: function(buffer, scope, args) {
                        var self = this;
                        var innerArgs, namedParameters, n, namedParam;
                        innerArgs = terms.generatedVariable([ "arguments" ]);
                        buffer.write("var ");
                        innerArgs.generateJavaScript(buffer, scope);
                        buffer.write("=Array.prototype.slice.call(");
                        args.generateJavaScript(buffer, scope);
                        buffer.write(",0,");
                        args.generateJavaScript(buffer, scope);
                        buffer.write(".length-1);");
                        terms.callbackFunction.generateJavaScript(buffer, scope);
                        buffer.write("=");
                        args.generateJavaScript(buffer, scope);
                        buffer.write("[");
                        args.generateJavaScript(buffer, scope);
                        buffer.write(".length-1];");
                        buffer.write("if(!(");
                        terms.callbackFunction.generateJavaScript(buffer, scope);
                        buffer.write(" instanceof Function)){throw new Error('asynchronous function called synchronously');}");
                        namedParameters = self.strategy.namedParameters();
                        for (n = 0; n < namedParameters.length; ++n) {
                            namedParam = self.strategy.namedParameters()[n];
                            namedParam.generateJavaScript(buffer, scope);
                            buffer.write("=");
                            innerArgs.generateJavaScript(buffer, scope);
                            buffer.write("[" + n + "];");
                        }
                        return self.strategy.generateJavaScriptParameterStatements(buffer, scope, innerArgs);
                    }
                };
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/continueStatement.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function() {
                var self = this;
                return self.isContinue = true;
            },
            generateJavaScriptStatement: function(buffer, scope) {
                var self = this;
                return buffer.write("continue;");
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                return self;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/definition.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(target, source, gen1_options) {
                var self = this;
                var async, shadow, assignment;
                async = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "async") && gen1_options.async !== void 0 ? gen1_options.async : false;
                shadow = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "shadow") && gen1_options.shadow !== void 0 ? gen1_options.shadow : false;
                assignment = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "assignment") && gen1_options.assignment !== void 0 ? gen1_options.assignment : false;
                self.isDefinition = true;
                self.target = target;
                self.source = source;
                self.isAsync = async;
                self.shadow = shadow;
                return self.isAssignment = assignment;
            },
            expression: function() {
                var self = this;
                return self;
            },
            hashEntry: function() {
                var self = this;
                return self.cg.hashEntry(self.target.hashEntryField(), self.source);
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                self.target.generateJavaScriptTarget(buffer, scope);
                buffer.write("=");
                return self.source.generateJavaScript(buffer, scope);
            },
            declareVariables: function(variables) {
                var self = this;
                var name;
                name = self.target.canonicalName(variables.scope);
                if (name) {
                    if (!self.isAssignment) {
                        if (self.shadow || !variables.isDeclared(name)) {
                            return variables.declare(name);
                        } else if (variables.isDeclared(name)) {
                            return terms.errors.addTermWithMessage(self, "variable " + self.target.displayName() + " is already defined, use := to reassign it");
                        }
                    } else if (!variables.isDeclared(name)) {
                        return terms.errors.addTermWithMessage(self, "variable " + self.target.displayName() + " is not defined, use = to define it");
                    }
                }
            },
            makeAsyncWithCallbackForResult: function(createCallbackForResult) {
                var self = this;
                var callback;
                if (self.isAsync) {
                    callback = createCallbackForResult(self.target);
                    return self.source.makeAsyncCallWithCallback(callback);
                }
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/fieldReference.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(object, name) {
                var self = this;
                self.object = object;
                self.name = name;
                return self.isFieldReference = true;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                self.object.generateJavaScript(buffer, scope);
                buffer.write(".");
                return buffer.write(codegenUtils.concatName(self.name));
            },
            generateJavaScriptTarget: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen1_o;
                gen1_o = self;
                return gen1_o.generateJavaScript.apply(gen1_o, args);
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/float.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(cg) {
        var self = this;
        return cg.term({
            constructor: function(value) {
                var self = this;
                self.isFloat = true;
                return self.float = value;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                return buffer.write(self.float.toString());
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/forEach.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var forEach;
        return forEach = function(collection, itemVariable, stmts) {
            var itemsVar, indexVar, s, gen1_o, statementsWithItemAssignment, init, test, incr;
            itemsVar = terms.generatedVariable([ "items" ]);
            indexVar = terms.generatedVariable([ "i" ]);
            s = [ terms.definition(itemVariable, terms.indexer(itemsVar, indexVar)) ];
            gen1_o = s;
            gen1_o.push.apply(gen1_o, stmts.statements);
            statementsWithItemAssignment = terms.statements(s, {
                async: stmts.isAsync
            });
            init = terms.definition(indexVar, terms.integer(0));
            test = terms.operator("<", [ indexVar, terms.fieldReference(itemsVar, [ "length" ]) ]);
            incr = terms.increment(indexVar);
            return terms.subStatements([ terms.definition(itemsVar, collection), terms.forStatement(init, test, incr, statementsWithItemAssignment) ]);
        };
    };
}).call(this);
});

require.define("/lib/terms/forExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var asyncControl;
    asyncControl = require("../asyncControl");
    module.exports = function(terms) {
        var self = this;
        var forExpressionTerm, forExpression;
        forExpressionTerm = terms.term({
            constructor: function(init, test, incr, stmts) {
                var self = this;
                self.isFor = true;
                self.initialization = init;
                self.test = test;
                self.increment = incr;
                self.indexVariable = init.target;
                self.statements = stmts;
                return self.statements = self._scopedBody();
            },
            _scopedBody: function() {
                var self = this;
                var containsReturn, forResultVariable, rewrittenStatements, loopStatements;
                containsReturn = false;
                forResultVariable = self.cg.generatedVariable([ "for", "result" ]);
                rewrittenStatements = self.statements.rewrite({
                    rewrite: function(term) {
                        if (term.isReturn) {
                            containsReturn = true;
                            return terms.subStatements([ self.cg.definition(forResultVariable, term.expression, {
                                assignment: true
                            }), self.cg.returnStatement(self.cg.boolean(true)) ]);
                        }
                    },
                    limit: function(term, gen1_options) {
                        var path;
                        path = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "path") && gen1_options.path !== void 0 ? gen1_options.path : path;
                        return term.isClosure;
                    }
                }).serialiseAllStatements();
                if (containsReturn) {
                    loopStatements = [];
                    loopStatements.push(self.cg.definition(forResultVariable, self.cg.nil()));
                    loopStatements.push(self.cg.ifExpression([ {
                        condition: self.cg.subExpression(self.cg.functionCall(self.cg.block([ self.indexVariable ], rewrittenStatements, {
                            returnLastStatement: false
                        }), [ self.indexVariable ])),
                        body: self.cg.statements([ self.cg.returnStatement(forResultVariable) ])
                    } ]));
                    return self.cg.asyncStatements(loopStatements);
                } else {
                    return self.statements;
                }
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("for(");
                self.initialization.generateJavaScript(buffer, scope);
                buffer.write(";");
                self.test.generateJavaScript(buffer, scope);
                buffer.write(";");
                self.increment.generateJavaScript(buffer, scope);
                buffer.write("){");
                self.statements.generateJavaScriptStatements(buffer, scope);
                return buffer.write("}");
            },
            generateJavaScriptStatement: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen2_o;
                gen2_o = self;
                return gen2_o.generateJavaScript.apply(gen2_o, args);
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                return void 0;
            }
        });
        return forExpression = function(init, test, incr, body) {
            var initStatements, testStatements, incrStatements, asyncForFunction;
            initStatements = terms.asyncStatements([ init ]);
            testStatements = terms.asyncStatements([ test ]);
            incrStatements = terms.asyncStatements([ incr ]);
            if (initStatements.isAsync || testStatements.isAsync || incrStatements.isAsync || body.isAsync) {
                asyncForFunction = terms.moduleConstants.defineAs([ "async", "for" ], terms.javascript(asyncControl.for.toString()));
                return terms.scope([ init, terms.functionCall(asyncForFunction, [ terms.argumentUtils.asyncifyBody(testStatements), terms.argumentUtils.asyncifyBody(incrStatements), terms.argumentUtils.asyncifyBody(body) ], {
                    async: true
                }) ]);
            } else {
                return forExpressionTerm(init, test, incr, body);
            }
        };
    };
}).call(this);
});

require.define("/lib/asyncControl.js",function(require,module,exports,__dirname,__filename,process,global){exports.try = function(body, catchBody, finallyBody, cb) {
  var callbackCalled = false;

  var callback = function (error, result) {
    if (!callbackCalled) {
      callbackCalled = true;
      cb(error, result);
    }
  };

  try {
    body(function (error, result) {
      if (error) {
        if (finallyBody && catchBody) {
          try {
            catchBody(error, function (error, result) {
              try {
                finallyBody(function (finallyError) {
                  callback(finallyError || error, finallyError || error? undefined: result);
                });
              } catch (error) {
                callback(error);
              }
            });
          } catch (error) {
            try {
              finallyBody(function (finallyError) {
                callback(finallyError || error);
              });
            } catch (error) {
              callback(error);
            }
          }
        } else if (catchBody) {
          try {
            catchBody(error, callback);
          } catch (error) {
            callback(error);
          }
        } else {
          try {
            finallyBody(function (finallyError) {
              callback(finallyError || error, finallyError? undefined: result);
            });
          } catch (error) {
            callback(error);
          }
        }
      } else {
        if (finallyBody) {
          try {
            finallyBody(function (finallyError) {
              callback(finallyError, finallyError? undefined: result);
            });
          } catch (error) {
            callback(error);
          }
        } else {
          callback(undefined, result);
        }
      }
    });
  } catch (error) {
    if (finallyBody && catchBody) {
      try {
        catchBody(error, function (error, result) {
          try {
            finallyBody(function (finallyError) {
              callback(finallyError || error, finallyError? undefined: result);
            });
          } catch (error) {
            callback(error);
          }
        });
      } catch (error) {
        try {
          finallyBody(function (finallyError) {
            callback(finallyError || error);
          });
        } catch (error) {
          callback(error);
        }
      }
    } else if (catchBody) {
      try {
        catchBody(error, callback);
      } catch (error) {
        callback(error);
      }
    } else {
      try {
        finallyBody(function (finallyError) {
          callback(finallyError || error);
        });
      } catch (error) {
        callback(error);
      }
    }
  }
};

exports.fork = function (block) {
    block(function () {});
};

exports.if = function (condition, thenBody, cb) {
  if (condition) {
    try {
      thenBody(cb);
    } catch (ex) {
      cb(ex);
    }
  } else {
    cb();
  }
};

exports.ifElse = function (condition, thenBody, elseBody, cb) {
  if (condition) {
    try {
      thenBody(cb);
    } catch (ex) {
      cb(ex);
    }
  } else {
    try {
      elseBody(cb);
    } catch (ex) {
      cb(ex);
    }
  }
};

exports.ifElseIfElse = function (cases, cb) {
    for (var n = 0; n < cases.length; n++) {
        var _case = cases[n];
        if (_case.condition) {
            try {
                _case.body (cb)
            } catch (error) {
                cb(error);
            }
            return;
        }
    }

    cb();
};

exports.while = function (conditionBody, body, cb) {
  var loop = function () {
    try {
      conditionBody(function (error, result) {
        if (error) {
          cb(error);
        } else if (result) {
          try {
            body(function (error, result) {
              if (error) {
                cb(error);
              } else {
                loop();
              }
            });
          } catch (error) {
            cb(error);
          }
        } else {
          cb();
        }
      });
    } catch (error) {
      cb(error);
    }
  };
  
  loop();
};

exports.for = function (test, incr, loop, cb) {
  try {
    var testAndLoop = function () {
      test(function (error, anotherLoop) {
        if (error) {
          cb(error);
        } else {
          if (anotherLoop) {
            loop(incrTestAndLoop);
          } else {
            cb();
          }
        }
      })
    };

    var incrTestAndLoop = function (error) {
      if (error) {
        cb(error);
      } else {
        incr(function (error) {
          if (error) {
            cb(error);
          } else {
            testAndLoop();
          }
        });
      }
    };

    testAndLoop();
  } catch (error) {
    cb(error);
  }
};

});

require.define("/lib/terms/forIn.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(iterator, collection, stmts) {
                var self = this;
                self.isForIn = true;
                self.iterator = terms.definition(iterator, terms.nil());
                self.collection = collection;
                return self.statements = terms.subExpression(terms.functionCall(terms.block([ iterator ], stmts, {
                    returnLastStatement: false
                }), [ iterator ]));
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("for(");
                self.iterator.target.generateJavaScript(buffer, scope);
                buffer.write(" in ");
                self.collection.generateJavaScript(buffer, scope);
                buffer.write("){");
                self.statements.generateJavaScriptStatement(buffer, scope);
                return buffer.write("}");
            },
            generateJavaScriptStatement: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen1_o;
                gen1_o = self;
                return gen1_o.generateJavaScript.apply(gen1_o, args);
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                return void 0;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/functionCall.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils, argumentUtils, _;
    codegenUtils = require("./codegenUtils");
    argumentUtils = require("./argumentUtils");
    _ = require("underscore");
    module.exports = function(terms) {
        var self = this;
        var functionCallTerm, functionCall;
        functionCallTerm = terms.term({
            constructor: function(fun, args, gen1_options) {
                var self = this;
                var optionalArguments, async, passThisToApply, originallyAsync, asyncCallbackArgument;
                optionalArguments = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "optionalArguments") && gen1_options.optionalArguments !== void 0 ? gen1_options.optionalArguments : [];
                async = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "async") && gen1_options.async !== void 0 ? gen1_options.async : false;
                passThisToApply = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "passThisToApply") && gen1_options.passThisToApply !== void 0 ? gen1_options.passThisToApply : false;
                originallyAsync = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "originallyAsync") && gen1_options.originallyAsync !== void 0 ? gen1_options.originallyAsync : false;
                asyncCallbackArgument = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "asyncCallbackArgument") && gen1_options.asyncCallbackArgument !== void 0 ? gen1_options.asyncCallbackArgument : void 0;
                self.isFunctionCall = true;
                self.function = fun;
                self.functionArguments = args;
                self.optionalArguments = optionalArguments;
                self.passThisToApply = passThisToApply;
                self.isAsync = async;
                self.originallyAsync = originallyAsync;
                return self.asyncCallbackArgument = asyncCallbackArgument;
            },
            hasSplatArguments: function() {
                var self = this;
                return _.any(self.functionArguments, function(arg) {
                    return arg.isSplat;
                });
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                var args, splattedArguments;
                self.function.generateJavaScript(buffer, scope);
                args = codegenUtils.concatArgs(self.functionArguments, {
                    optionalArgs: self.optionalArguments,
                    asyncCallbackArg: self.asyncCallbackArgument,
                    terms: terms
                });
                splattedArguments = self.cg.splatArguments(args);
                if (splattedArguments && self.function.isIndexer) {
                    buffer.write(".apply(");
                    self.function.object.generateJavaScript(buffer, scope);
                    buffer.write(",");
                    splattedArguments.generateJavaScript(buffer, scope);
                    return buffer.write(")");
                } else if (splattedArguments) {
                    buffer.write(".apply(");
                    if (self.passThisToApply) {
                        buffer.write("this");
                    } else {
                        buffer.write("null");
                    }
                    buffer.write(",");
                    splattedArguments.generateJavaScript(buffer, scope);
                    return buffer.write(")");
                } else {
                    buffer.write("(");
                    codegenUtils.writeToBufferWithDelimiter(args, ",", buffer, scope);
                    return buffer.write(")");
                }
            },
            makeAsyncCallWithCallback: function(callback) {
                var self = this;
                self.asyncCallbackArgument = callback;
                return self;
            }
        });
        return functionCall = function(fun, args, gen2_options) {
            var optionalArguments, async, passThisToApply, originallyAsync, asyncCallbackArgument, couldBeMacro;
            optionalArguments = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "optionalArguments") && gen2_options.optionalArguments !== void 0 ? gen2_options.optionalArguments : [];
            async = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "async") && gen2_options.async !== void 0 ? gen2_options.async : false;
            passThisToApply = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "passThisToApply") && gen2_options.passThisToApply !== void 0 ? gen2_options.passThisToApply : false;
            originallyAsync = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "originallyAsync") && gen2_options.originallyAsync !== void 0 ? gen2_options.originallyAsync : false;
            asyncCallbackArgument = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "asyncCallbackArgument") && gen2_options.asyncCallbackArgument !== void 0 ? gen2_options.asyncCallbackArgument : void 0;
            couldBeMacro = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "couldBeMacro") && gen2_options.couldBeMacro !== void 0 ? gen2_options.couldBeMacro : true;
            var asyncResult, name, macro, funCall;
            if (async) {
                asyncResult = terms.asyncResult();
                terms.argumentUtils.asyncifyArguments(args, optionalArguments);
                return terms.subStatements([ terms.definition(asyncResult, functionCallTerm(fun, args, {
                    optionalArguments: optionalArguments,
                    passThisToApply: passThisToApply,
                    originallyAsync: true,
                    asyncCallbackArgument: asyncCallbackArgument
                }), {
                    async: true
                }), asyncResult ]);
            } else if (fun.variable && couldBeMacro) {
                name = fun.variable;
                macro = terms.macros.findMacro(name);
                funCall = functionCallTerm(fun, args, {
                    optionalArguments: optionalArguments
                });
                if (macro) {
                    return macro(funCall, name, args, optionalArguments);
                }
            }
            return functionCallTerm(fun, args, {
                optionalArguments: optionalArguments,
                passThisToApply: passThisToApply,
                originallyAsync: originallyAsync,
                asyncCallbackArgument: asyncCallbackArgument
            });
        };
    };
}).call(this);
});

require.define("/lib/terms/generatedVariable.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(name) {
                var self = this;
                self.name = name;
                self.isVariable = true;
                return self.genVar = void 0;
            },
            dontClone: true,
            generatedName: function(scope) {
                var self = this;
                if (!self.genVar) {
                    self.genVar = scope.generateVariable(codegenUtils.concatName(self.name));
                }
                return self.genVar;
            },
            canonicalName: function(scope) {
                var self = this;
                return self.generatedName(scope);
            },
            displayName: function() {
                var self = this;
                return self.name;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                return buffer.write(self.generatedName(scope));
            },
            generateJavaScriptParameter: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen1_o;
                gen1_o = self;
                return gen1_o.generateJavaScript.apply(gen1_o, args);
            },
            generateJavaScriptTarget: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen2_o;
                gen2_o = self;
                return gen2_o.generateJavaScript.apply(gen2_o, args);
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/hash.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(entries) {
                var self = this;
                self.isHash = true;
                return self.entries = entries;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("{");
                codegenUtils.writeToBufferWithDelimiter(self.entries, ",", buffer, function(item) {
                    return item.generateJavaScriptHashEntry(buffer, scope);
                });
                return buffer.write("}");
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/hashEntry.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils, isLegalJavaScriptIdentifier;
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(field, value) {
                var self = this;
                self.isHashEntry = true;
                self.field = field;
                return self.value = value;
            },
            legalFieldName: function() {
                var self = this;
                var f;
                if (self.field.isString) {
                    return codegenUtils.formatJavaScriptString(self.field.string);
                }
                f = codegenUtils.concatName(self.field);
                if (isLegalJavaScriptIdentifier(f)) {
                    return f;
                } else {
                    return codegenUtils.formatJavaScriptString(f);
                }
            },
            valueOrTrue: function() {
                var self = this;
                if (self.value === undefined) {
                    return self.cg.boolean(true);
                } else {
                    return self.value;
                }
            },
            generateJavaScriptHashEntry: function(buffer, scope) {
                var self = this;
                var f;
                f = codegenUtils.concatName(self.field);
                buffer.write(self.legalFieldName());
                buffer.write(":");
                return self.valueOrTrue().generateJavaScript(buffer, scope);
            },
            asyncify: function() {
                var self = this;
                return self.value.asyncify();
            }
        });
    };
    isLegalJavaScriptIdentifier = function(id) {
        return /^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(id);
    };
}).call(this);
});

require.define("/lib/terms/identifier.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(cg) {
        var self = this;
        return cg.term({
            constructor: function(name) {
                var self = this;
                self.isIdentifier = true;
                return self.identifier = name;
            },
            arguments: function() {
                var self = this;
                return void 0;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/ifExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils, _, asyncControl;
    codegenUtils = require("./codegenUtils");
    _ = require("underscore");
    asyncControl = require("../asyncControl");
    module.exports = function(terms) {
        var self = this;
        var ifExpressionTerm, ifExpression;
        ifExpressionTerm = terms.term({
            constructor: function(cases, elseBody) {
                var self = this;
                self.isIfExpression = true;
                self.cases = cases;
                return self.elseBody = elseBody;
            },
            generateJavaScriptStatement: function(buffer, scope) {
                var self = this;
                codegenUtils.writeToBufferWithDelimiter(self.cases, "else ", buffer, function(case_) {
                    buffer.write("if(");
                    case_.condition.generateJavaScript(buffer, scope);
                    buffer.write("){");
                    case_.body.generateJavaScriptStatements(buffer, scope);
                    return buffer.write("}");
                });
                if (self.elseBody) {
                    buffer.write("else{");
                    self.elseBody.generateJavaScriptStatements(buffer, scope);
                    return buffer.write("}");
                }
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                self.rewriteResultTermInto(function(term) {
                    return terms.returnStatement(term);
                });
                buffer.write("(function(){");
                self.generateJavaScriptStatement(buffer, scope);
                return buffer.write("})()");
            },
            rewriteResultTermInto: function(returnTerm, gen1_options) {
                var self = this;
                var async;
                async = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "async") && gen1_options.async !== void 0 ? gen1_options.async : false;
                var gen2_items, gen3_i, _case;
                gen2_items = self.cases;
                for (gen3_i = 0; gen3_i < gen2_items.length; ++gen3_i) {
                    _case = gen2_items[gen3_i];
                    _case.body.rewriteResultTermInto(returnTerm);
                }
                if (self.elseBody) {
                    self.elseBody.rewriteResultTermInto(returnTerm);
                } else if (async) {
                    self.elseBody = terms.statements([ terms.functionCall(terms.callbackFunction, []) ]);
                }
                return self;
            }
        });
        return ifExpression = function(cases, elseBody) {
            var anyAsyncCases, caseForConditionAndBody, casesList, asyncIfElseIfElseFunction, asyncIfElseFunction, asyncIfFunction;
            anyAsyncCases = _.any(cases, function(_case) {
                return _case.body.isAsync;
            });
            if (anyAsyncCases || elseBody && elseBody.isAsync) {
                if (cases.length > 1) {
                    caseForConditionAndBody = function(condition, body) {
                        return terms.hash([ terms.hashEntry([ "condition" ], condition), terms.hashEntry([ "body" ], terms.argumentUtils.asyncifyBody(body)) ]);
                    };
                    casesList = _.map(cases, function(_case) {
                        return caseForConditionAndBody(_case.condition, _case.body);
                    });
                    if (elseBody) {
                        casesList.push(caseForConditionAndBody(terms.boolean(true), elseBody));
                    }
                    asyncIfElseIfElseFunction = terms.moduleConstants.defineAs([ "async", "if", "else", "if", "else" ], terms.javascript(asyncControl.ifElseIfElse.toString()));
                    return terms.functionCall(asyncIfElseIfElseFunction, [ terms.list(casesList) ], {
                        async: true
                    });
                } else if (elseBody) {
                    asyncIfElseFunction = terms.moduleConstants.defineAs([ "async", "if", "else" ], terms.javascript(asyncControl.ifElse.toString()));
                    return terms.functionCall(asyncIfElseFunction, [ cases[0].condition, terms.argumentUtils.asyncifyBody(cases[0].body), terms.argumentUtils.asyncifyBody(elseBody) ], {
                        async: true
                    });
                } else {
                    asyncIfFunction = terms.moduleConstants.defineAs([ "async", "if" ], terms.javascript(asyncControl.if.toString()));
                    return terms.functionCall(asyncIfFunction, [ cases[0].condition, terms.argumentUtils.asyncifyBody(cases[0].body) ], {
                        async: true
                    });
                }
            } else {
                return ifExpressionTerm(cases, elseBody);
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/increment.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(expr) {
                var self = this;
                self.isIncrement = true;
                return self.expression = expr;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("++");
                return self.expression.generateJavaScript(buffer, scope);
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/indexer.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(object, indexer) {
                var self = this;
                self.object = object;
                self.indexer = indexer;
                return self.isIndexer = true;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                self.object.generateJavaScript(buffer, scope);
                buffer.write("[");
                self.indexer.generateJavaScript(buffer, scope);
                return buffer.write("]");
            },
            generateJavaScriptTarget: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen1_o;
                gen1_o = self;
                return gen1_o.generateJavaScript.apply(gen1_o, args);
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/integer.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(cg) {
        var self = this;
        return cg.term({
            constructor: function(value) {
                var self = this;
                self.isInteger = true;
                return self.integer = value;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                return buffer.write(self.integer.toString());
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/interpolatedString.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        var createInterpolatedString, interpolatedString;
        createInterpolatedString = terms.term({
            constructor: function(components) {
                var self = this;
                self.isInterpolatedString = true;
                return self.components = components;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("(");
                codegenUtils.writeToBufferWithDelimiter(this.components, "+", buffer, scope);
                return buffer.write(")");
            }
        });
        return interpolatedString = function(components) {
            if (components.length === 1) {
                return components[0];
            } else if (components.length === 0) {
                return terms.string("");
            } else {
                return createInterpolatedString(components);
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/javascript.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(source) {
                var self = this;
                self.isJavaScript = true;
                return self.source = source;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                return buffer.write(self.source);
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/list.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils, _;
    codegenUtils = require("./codegenUtils");
    _ = require("underscore");
    module.exports = function(terms) {
        var self = this;
        var listTerm, list;
        listTerm = terms.term({
            constructor: function(items) {
                var self = this;
                self.isList = true;
                return self.items = items;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("[");
                codegenUtils.writeToBufferWithDelimiter(self.items, ",", buffer, scope);
                return buffer.write("]");
            }
        });
        return list = function(items) {
            var hashEntry, macro;
            hashEntry = _.find(items, function(item) {
                return item.isHashEntry;
            });
            if (hashEntry) {
                macro = terms.listMacros.findMacro(hashEntry.field);
                if (macro) {
                    return macro(listTerm(items), hashEntry.field);
                } else {
                    return terms.errors.addTermWithMessage(hashEntry, "no macro for " + hashEntry.field.join(" "));
                }
            } else {
                return listTerm(items);
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/methodCall.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils, argumentUtils;
    codegenUtils = require("./codegenUtils");
    argumentUtils = require("./argumentUtils");
    module.exports = function(terms) {
        var self = this;
        var methodCallTerm, methodCall;
        methodCallTerm = terms.term({
            constructor: function(object, name, args, gen1_options) {
                var self = this;
                var optionalArguments, async, originallyAsync, asyncCallbackArgument;
                optionalArguments = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "optionalArguments") && gen1_options.optionalArguments !== void 0 ? gen1_options.optionalArguments : [];
                async = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "async") && gen1_options.async !== void 0 ? gen1_options.async : false;
                originallyAsync = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "originallyAsync") && gen1_options.originallyAsync !== void 0 ? gen1_options.originallyAsync : false;
                asyncCallbackArgument = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "asyncCallbackArgument") && gen1_options.asyncCallbackArgument !== void 0 ? gen1_options.asyncCallbackArgument : void 0;
                self.isMethodCall = true;
                self.object = object;
                self.name = name;
                self.methodArguments = args;
                self.optionalArguments = optionalArguments;
                self.isAsync = async;
                self.originallyAsync = originallyAsync;
                return self.asyncCallbackArgument = asyncCallbackArgument;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                var args;
                self.object.generateJavaScript(buffer, scope);
                buffer.write(".");
                buffer.write(codegenUtils.concatName(self.name));
                buffer.write("(");
                args = codegenUtils.concatArgs(self.methodArguments, {
                    optionalArgs: self.optionalArguments,
                    terms: terms,
                    asyncCallbackArg: self.asyncCallbackArgument
                });
                codegenUtils.writeToBufferWithDelimiter(args, ",", buffer, scope);
                return buffer.write(")");
            },
            makeAsyncCallWithCallback: function(callback) {
                var self = this;
                self.asyncCallbackArgument = callback;
                return self;
            }
        });
        return methodCall = function(object, name, args, gen2_options) {
            var optionalArguments, async;
            optionalArguments = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "optionalArguments") && gen2_options.optionalArguments !== void 0 ? gen2_options.optionalArguments : [];
            async = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "async") && gen2_options.async !== void 0 ? gen2_options.async : false;
            var splattedArgs, objectVar, asyncResult;
            splattedArgs = terms.splatArguments(args, optionalArguments);
            if (splattedArgs) {
                objectVar = terms.generatedVariable([ "o" ]);
                return terms.subStatements([ terms.definition(objectVar, object), methodCall(terms.fieldReference(objectVar, name), [ "apply" ], [ objectVar, splattedArgs ], void 0, {
                    async: async
                }) ]);
            } else if (async) {
                terms.argumentUtils.asyncifyArguments(args, optionalArguments);
                asyncResult = terms.asyncResult();
                return terms.subStatements([ terms.definition(asyncResult, methodCallTerm(object, name, args, {
                    optionalArguments: optionalArguments,
                    async: async,
                    originallyAsync: true
                }), {
                    async: true
                }), asyncResult ]);
            } else {
                return methodCallTerm(object, name, args, {
                    optionalArguments: optionalArguments,
                    async: async
                });
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/module.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var moduleTerm, module;
        moduleTerm = terms.term({
            constructor: function(statements, gen1_options) {
                var self = this;
                var global, returnLastStatement, bodyStatements;
                global = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "global") && gen1_options.global !== void 0 ? gen1_options.global : false;
                returnLastStatement = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "returnLastStatement") && gen1_options.returnLastStatement !== void 0 ? gen1_options.returnLastStatement : false;
                bodyStatements = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "bodyStatements") && gen1_options.bodyStatements !== void 0 ? gen1_options.bodyStatements : void 0;
                self.statements = statements;
                self.isModule = true;
                self.global = global;
                return self.bodyStatements = bodyStatements || statements;
            },
            generateJavaScriptModule: function(buffer) {
                var self = this;
                var scope, definitions, gen2_o;
                scope = new terms.SymbolScope(void 0);
                definitions = terms.moduleConstants.definitions();
                gen2_o = self.bodyStatements.statements;
                gen2_o.unshift.apply(gen2_o, definitions);
                return self.statements.generateJavaScriptStatements(buffer, scope, {
                    global: self.global,
                    inClosure: true
                });
            }
        });
        return module = function(statements, gen3_options) {
            var inScope, global, returnLastStatement, bodyStatements;
            inScope = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "inScope") && gen3_options.inScope !== void 0 ? gen3_options.inScope : true;
            global = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "global") && gen3_options.global !== void 0 ? gen3_options.global : false;
            returnLastStatement = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "returnLastStatement") && gen3_options.returnLastStatement !== void 0 ? gen3_options.returnLastStatement : false;
            bodyStatements = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "bodyStatements") && gen3_options.bodyStatements !== void 0 ? gen3_options.bodyStatements : bodyStatements;
            var scope, args, errorVariable, throwIfError, methodCall;
            if (returnLastStatement) {
                statements.rewriteLastStatementToReturn({
                    async: false
                });
            }
            if (inScope) {
                scope = terms.closure([], statements, {
                    returnLastStatement: returnLastStatement,
                    redefinesSelf: true
                });
                args = [ terms.variable([ "this" ]) ];
                if (statements.isAsync) {
                    errorVariable = terms.generatedVariable([ "error" ]);
                    throwIfError = terms.ifExpression([ {
                        condition: errorVariable,
                        body: terms.statements([ terms.functionCall(terms.variable([ "set", "timeout" ]), [ terms.closure([], terms.statements([ terms.throwStatement(errorVariable) ])), terms.integer(0) ]) ])
                    } ]);
                    args.push(terms.closure([ errorVariable ], terms.statements([ throwIfError ])));
                }
                methodCall = terms.methodCall(terms.subExpression(scope), [ "call" ], args);
                return moduleTerm(terms.statements([ methodCall ]), {
                    bodyStatements: statements,
                    global: global
                });
            } else {
                return moduleTerm(statements, {
                    global: global,
                    returnLastStatement: returnLastStatement,
                    bodyStatements: bodyStatements
                });
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/newOperator.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var newOperatorTerm, newOperator;
        newOperatorTerm = terms.term({
            constructor: function(fn) {
                var self = this;
                self.isNewOperator = true;
                return self.functionCall = fn;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("new ");
                if (self.functionCall.isVariable) {
                    return terms.functionCall(self.functionCall, []).generateJavaScript(buffer, scope);
                } else if (self.functionCall.isFunctionCall && self.functionCall.hasSplatArguments()) {
                    return self.cg.block([], self.cg.statements([ self.functionCall ]), {
                        returnLastStatement: false
                    }).generateJavaScript(buffer, scope);
                } else {
                    return self.functionCall.generateJavaScript(buffer, scope);
                }
            }
        });
        return newOperator = function(fn) {
            var statements, constructor, constructorVariable;
            if (fn.isFunctionCall && fn.hasSplatArguments()) {
                statements = [];
                fn.passThisToApply = true;
                constructor = terms.block([], terms.statements([ fn ]), {
                    returnLastStatement: false
                });
                constructorVariable = terms.generatedVariable([ "c" ]);
                statements.push(terms.definition(constructorVariable, constructor));
                statements.push(terms.definition(terms.fieldReference(constructorVariable, [ "prototype" ]), terms.fieldReference(fn.function, [ "prototype" ])));
                statements.push(terms.newOperator(constructorVariable));
                return terms.subStatements(statements);
            } else {
                return newOperatorTerm(fn);
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/nil.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function() {
                var self = this;
                return self.isNil = true;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                return terms.javascript("void 0").generateJavaScript(buffer, scope);
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/normalParameters.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(parameters) {
                var self = this;
                return self.parameters = parameters;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/operator.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(op, args) {
                var self = this;
                self.isOperator = true;
                self.operator = op;
                return self.operatorArguments = args;
            },
            isOperatorAlpha: function() {
                var self = this;
                return /[a-zA-Z]+/.test(self.operator);
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                var alpha, n;
                buffer.write("(");
                if (self.operatorArguments.length === 1) {
                    buffer.write(self.operator);
                    if (self.isOperatorAlpha()) {
                        buffer.write(" ");
                    }
                    self.operatorArguments[0].generateJavaScript(buffer, scope);
                } else {
                    alpha = self.isOperatorAlpha();
                    self.operatorArguments[0].generateJavaScript(buffer, scope);
                    for (n = 1; n < self.operatorArguments.length; ++n) {
                        if (alpha) {
                            buffer.write(" ");
                        }
                        buffer.write(self.operator);
                        if (alpha) {
                            buffer.write(" ");
                        }
                        self.operatorArguments[n].generateJavaScript(buffer, scope);
                    }
                }
                return buffer.write(")");
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/parameters.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(parms) {
                var self = this;
                self.isParameters = true;
                return self.parameters = parms;
            },
            arguments: function() {
                var self = this;
                return [];
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/regExp.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(patternOptions) {
                var self = this;
                self.isRegExp = true;
                self.pattern = patternOptions.pattern;
                return self.options = patternOptions.options;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                var options;
                options = function() {
                    if (self.options) {
                        return "/" + self.options;
                    } else {
                        return "/";
                    }
                }();
                return buffer.write("/" + this.pattern.replace(/\//g, "\\/") + options);
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/returnStatement.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(expr, gen1_options) {
                var self = this;
                var implicit;
                implicit = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "implicit") && gen1_options.implicit !== void 0 ? gen1_options.implicit : false;
                self.isReturn = true;
                self.expression = expr;
                return self.isImplicit = implicit;
            },
            generateJavaScriptStatement: function(buffer, scope) {
                var self = this;
                if (self.expression) {
                    buffer.write("return ");
                    self.expression.generateJavaScript(buffer, scope);
                    return buffer.write(";");
                } else {
                    return buffer.write("return;");
                }
            },
            rewriteResultTermInto: function(returnTerm, gen2_options) {
                var self = this;
                var async;
                async = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "async") && gen2_options.async !== void 0 ? gen2_options.async : false;
                var arguments;
                if (async) {
                    arguments = function() {
                        if (self.expression) {
                            return [ terms.nil(), self.expression ];
                        } else {
                            return [];
                        }
                    }();
                    return terms.functionCall(terms.callbackFunction, arguments);
                } else {
                    return self;
                }
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/scope.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var scope;
        return scope = function(statementList) {
            var statement, statements;
            if (statementList.length === 1) {
                statement = statementList[0];
                if (statement.isReturn) {
                    return statement.expression;
                } else {
                    return statement;
                }
            } else {
                statements = terms.asyncStatements(statementList);
                return terms.functionCall(terms.subExpression(terms.block([], statements)), [], {
                    async: statements.isAsync
                });
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/selfExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var selfExpression;
        return selfExpression = function() {
            return terms.variable([ "self" ], {
                shadow: true
            });
        };
    };
}).call(this);
});

require.define("/lib/terms/semanticError.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(errorTerms, message) {
                var self = this;
                self.isSemanticError = true;
                self.errorTerms = errorTerms;
                return self.message = message;
            },
            generateJavaScript: function() {
                var self = this;
                return void 0;
            },
            printError: function(sourceFile, buffer) {
                var self = this;
                sourceFile.printLocation(self.errorTerms[0].location(), buffer);
                return buffer.write(this.message + "\n");
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/splat.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function() {
                var self = this;
                return self.isSplat = true;
            },
            parameter: function() {
                var self = this;
                return self;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/splatArguments.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _;
    _ = require("underscore");
    module.exports = function(terms) {
        var self = this;
        var splatArgumentsTerm, splatArguments;
        splatArgumentsTerm = terms.term({
            constructor: function(splatArguments) {
                var self = this;
                return self.splatArguments = splatArguments;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                var i, splatArgument;
                for (i = 0; i < self.splatArguments.length; ++i) {
                    splatArgument = self.splatArguments[i];
                    if (i === 0) {
                        splatArgument.generateJavaScript(buffer, scope);
                    } else {
                        buffer.write(".concat(");
                        splatArgument.generateJavaScript(buffer, scope);
                        buffer.write(")");
                    }
                }
                return void 0;
            }
        });
        return splatArguments = function(args, optionalArgs) {
            var splatArgs, previousArgs, foundSplat, i, current, next, concat;
            splatArgs = [];
            previousArgs = [];
            foundSplat = false;
            i = 0;
            while (i < args.length) {
                current = args[i];
                next = args[i + 1];
                if (next && next.isSplat) {
                    foundSplat = true;
                    if (previousArgs.length > 0) {
                        splatArgs.push(terms.list(previousArgs));
                        previousArgs = [];
                    }
                    splatArgs.push(current);
                    ++i;
                } else if (current.isSplat) {
                    terms.errors.addTermWithMessage(current, "splat keyword with no argument to splat");
                } else {
                    previousArgs.push(current);
                }
                ++i;
            }
            if (optionalArgs && optionalArgs.length > 0) {
                previousArgs.push(terms.hash(optionalArgs));
            }
            if (previousArgs.length > 0) {
                splatArgs.push(terms.list(previousArgs));
            }
            if (foundSplat) {
                concat = function(initial, last) {
                    if (initial.length > 0) {
                        return terms.methodCall(concat(_.initial(initial), _.last(initial)), [ "concat" ], [ last ]);
                    } else {
                        return last;
                    }
                };
                return concat(_.initial(splatArgs), _.last(splatArgs));
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/splatParameters.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(parameters) {
                var self = this;
                return self.parameters = parameters;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/statements.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, codegenUtils, statementsUtils;
    _ = require("underscore");
    codegenUtils = require("./codegenUtils");
    statementsUtils = require("./statementsUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(statements, gen1_options) {
                var self = this;
                var async;
                async = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "async") && gen1_options.async !== void 0 ? gen1_options.async : false;
                self.isStatements = true;
                self.statements = statements;
                return self.isAsync = async;
            },
            generateStatements: function(statements, buffer, scope, gen2_options) {
                var self = this;
                var inClosure, global;
                inClosure = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "inClosure") && gen2_options.inClosure !== void 0 ? gen2_options.inClosure : false;
                global = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "global") && gen2_options.global !== void 0 ? gen2_options.global : false;
                var declaredVariables, s, statement;
                if (inClosure) {
                    declaredVariables = self.findDeclaredVariables(scope);
                    self.generateVariableDeclarations(declaredVariables, buffer, scope, {
                        global: global
                    });
                }
                for (s = 0; s < statements.length; ++s) {
                    statement = statements[s];
                    statement.generateJavaScriptStatement(buffer, scope);
                }
                return void 0;
            },
            rewriteResultTermInto: function(returnTerm, gen3_options) {
                var self = this;
                var async;
                async = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "async") && gen3_options.async !== void 0 ? gen3_options.async : false;
                var lastStatement, rewrittenLastStatement;
                if (self.statements.length > 0) {
                    lastStatement = self.statements[self.statements.length - 1];
                    rewrittenLastStatement = lastStatement.rewriteResultTermInto(function(term) {
                        return returnTerm(term);
                    }, {
                        async: async
                    });
                    if (rewrittenLastStatement) {
                        return self.statements[self.statements.length - 1] = rewrittenLastStatement;
                    } else {
                        return self.statements.push(returnTerm(terms.nil()));
                    }
                }
            },
            rewriteLastStatementToReturn: function(gen4_options) {
                var self = this;
                var async;
                async = gen4_options !== void 0 && Object.prototype.hasOwnProperty.call(gen4_options, "async") && gen4_options.async !== void 0 ? gen4_options.async : false;
                var containsContinuation;
                containsContinuation = self.containsContinuation();
                return self.rewriteResultTermInto(function(term) {
                    if (async && !containsContinuation) {
                        return terms.functionCall(terms.callbackFunction, [ terms.nil(), term ]);
                    } else {
                        return terms.returnStatement(term, {
                            implicit: true
                        });
                    }
                }, {
                    async: async
                });
            },
            generateVariableDeclarations: function(variables, buffer, scope, gen5_options) {
                var self = this;
                var global;
                global = gen5_options !== void 0 && Object.prototype.hasOwnProperty.call(gen5_options, "global") && gen5_options.global !== void 0 ? gen5_options.global : false;
                if (variables.length > 0) {
                    _(variables).each(function(name) {
                        return scope.define(name);
                    });
                    if (!global) {
                        buffer.write("var ");
                        codegenUtils.writeToBufferWithDelimiter(variables, ",", buffer, function(variable) {
                            return buffer.write(variable);
                        });
                        return buffer.write(";");
                    }
                }
            },
            findDeclaredVariables: function(scope) {
                var self = this;
                var variables;
                variables = codegenUtils.declaredVariables(scope);
                self.walkDescendantsNotBelowIf(function(subterm, path) {
                    return subterm.declareVariables(variables, scope);
                }, function(subterm, path) {
                    return subterm.isClosure;
                });
                return variables.uniqueVariables();
            },
            generateJavaScriptStatements: function(buffer, scope, gen6_options) {
                var self = this;
                var inClosure, global;
                inClosure = gen6_options !== void 0 && Object.prototype.hasOwnProperty.call(gen6_options, "inClosure") && gen6_options.inClosure !== void 0 ? gen6_options.inClosure : false;
                global = gen6_options !== void 0 && Object.prototype.hasOwnProperty.call(gen6_options, "global") && gen6_options.global !== void 0 ? gen6_options.global : false;
                return self.generateStatements(self.statements, buffer, scope, {
                    inClosure: inClosure,
                    global: global
                });
            },
            blockify: function(parameters, gen7_options) {
                var self = this;
                var optionalParameters, async;
                optionalParameters = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "optionalParameters") && gen7_options.optionalParameters !== void 0 ? gen7_options.optionalParameters : void 0;
                async = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "async") && gen7_options.async !== void 0 ? gen7_options.async : false;
                var statements;
                statements = function() {
                    if (self.isExpressionStatements) {
                        return self.cg.statements([ self ]);
                    } else {
                        return self;
                    }
                }();
                return terms.block(parameters, statements, {
                    optionalParameters: optionalParameters,
                    async: async
                });
            },
            scopify: function() {
                var self = this;
                return self.cg.functionCall(self.cg.block([], self), []);
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                if (self.statements.length > 0) {
                    return self.statements[self.statements.length - 1].generateJavaScript(buffer, scope);
                }
            },
            generateJavaScriptStatement: function(buffer, scope) {
                var self = this;
                if (self.statements.length > 0) {
                    return self.statements[self.statements.length - 1].generateJavaScriptStatement(buffer, scope);
                }
            },
            definitions: function(scope) {
                var self = this;
                return _(self.statements).reduce(function(list, statement) {
                    var defs;
                    defs = statement.definitions(scope);
                    return list.concat(defs);
                }, []);
            },
            serialiseStatements: function() {
                var self = this;
                self.statements = statementsUtils.serialiseStatements(self.statements);
                return void 0;
            },
            asyncify: function() {
                var self = this;
                if (!self.isAsync) {
                    self.rewriteLastStatementToReturn({
                        async: true
                    });
                    return self.isAsync = true;
                }
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/string.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(value) {
                var self = this;
                self.isString = true;
                return self.string = value;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                return buffer.write(codegenUtils.formatJavaScriptString(this.string));
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/subExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(expression) {
                var self = this;
                self.isSubExpression = true;
                return self.expression = expression;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("(");
                self.expression.generateJavaScript(buffer, scope);
                return buffer.write(")");
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/subStatements.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, codegenUtils;
    _ = require("underscore");
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(statements) {
                var self = this;
                self.isSubStatements = true;
                return self.statements = statements;
            },
            serialiseSubStatements: function(statements, gen1_options) {
                var self = this;
                var rewrite;
                rewrite = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "rewrite") && gen1_options.rewrite !== void 0 ? gen1_options.rewrite : void 0;
                var firstStatements, rewrittenStatements, gen2_o, lastStatement;
                firstStatements = self.statements.slice(0, self.statements.length - 1);
                rewrittenStatements = _.map(firstStatements, function(statement) {
                    return rewrite(statement);
                });
                gen2_o = statements;
                gen2_o.push.apply(gen2_o, rewrittenStatements);
                lastStatement = self.statements[self.statements.length - 1];
                if (lastStatement.isSubStatements) {
                    return lastStatement.serialiseSubStatements(statements, {
                        rewrite: rewrite
                    });
                } else {
                    return lastStatement;
                }
            },
            generateJavaScript: function() {
                var self = this;
                self.show();
                throw new Error("sub statements does not generate java script");
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/terms.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, util;
    require("../class");
    _ = require("underscore");
    util = require("util");
    module.exports = function(cg) {
        var self = this;
        var Node, Term, termPrototype, term;
        Node = $class({
            cg: cg,
            constructor: function(members) {
                var self = this;
                var member;
                if (members) {
                    for (member in members) {
                        (function(member) {
                            if (members.hasOwnProperty(member)) {
                                self[member] = members[member];
                            }
                        })(member);
                    }
                    return void 0;
                }
            },
            setLocation: function(newLocation) {
                var self = this;
                return Object.defineProperty(self, "_location", {
                    value: newLocation,
                    writable: true
                });
            },
            location: function() {
                var self = this;
                var children, locations, firstLine, lastLine, locationsOnFirstLine, locationsOnLastLine;
                if (self._location) {
                    return self._location;
                } else {
                    children = self.children();
                    locations = _.filter(_.map(children, function(child) {
                        return child.location();
                    }), function(location) {
                        return location;
                    });
                    if (locations.length > 0) {
                        firstLine = _.min(_.map(locations, function(location) {
                            return location.firstLine;
                        }));
                        lastLine = _.max(_.map(locations, function(location) {
                            return location.lastLine;
                        }));
                        locationsOnFirstLine = _.filter(locations, function(location) {
                            return location.firstLine === firstLine;
                        });
                        locationsOnLastLine = _.filter(locations, function(location) {
                            return location.lastLine === lastLine;
                        });
                        return {
                            firstLine: firstLine,
                            lastLine: lastLine,
                            firstColumn: _.min(_.map(locationsOnFirstLine, function(location) {
                                return location.firstColumn;
                            })),
                            lastColumn: _.max(_.map(locationsOnLastLine, function(location) {
                                return location.lastColumn;
                            }))
                        };
                    } else {
                        return void 0;
                    }
                }
            },
            clone: function(gen1_options) {
                var self = this;
                var rewrite, limit, createObject;
                rewrite = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "rewrite") && gen1_options.rewrite !== void 0 ? gen1_options.rewrite : function(subterm) {
                    return void 0;
                };
                limit = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "limit") && gen1_options.limit !== void 0 ? gen1_options.limit : function(subterm) {
                    return false;
                };
                createObject = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "createObject") && gen1_options.createObject !== void 0 ? gen1_options.createObject : function(node) {
                    return Object.create(Object.getPrototypeOf(node));
                };
                var cloneObject, cloneNode, cloneArray, cloneSubterm;
                cloneObject = function(node, allowRewrite, path) {
                    var t, member;
                    t = createObject(node);
                    for (member in node) {
                        (function(member) {
                            if (node.hasOwnProperty(member)) {
                                t[member] = cloneSubterm(node[member], allowRewrite, path);
                            }
                        })(member);
                    }
                    return t;
                };
                cloneNode = function(originalNode, allowRewrite, path) {
                    var rewrittenNode, subClone;
                    if (originalNode.dontClone) {
                        return originalNode;
                    } else {
                        try {
                            path.push(originalNode);
                            rewrittenNode = function() {
                                if (originalNode instanceof Node && allowRewrite) {
                                    subClone = function(node) {
                                        if (node) {
                                            return cloneSubterm(node, allowRewrite, path);
                                        } else {
                                            return cloneObject(originalNode, allowRewrite, path);
                                        }
                                    };
                                    return rewrite(originalNode, {
                                        path: path,
                                        clone: subClone,
                                        rewrite: subClone
                                    });
                                } else {
                                    return void 0;
                                }
                            }();
                            if (!rewrittenNode) {
                                return cloneObject(originalNode, allowRewrite, path);
                            } else {
                                if (!(rewrittenNode instanceof Node)) {
                                    throw new Error("rewritten node not an instance of Node");
                                }
                                rewrittenNode.isDerivedFrom(originalNode);
                                return rewrittenNode;
                            }
                        } finally {
                            path.pop();
                        }
                    }
                };
                cloneArray = function(terms, allowRewrite, path) {
                    try {
                        path.push(terms);
                        return _.map(terms, function(node) {
                            return cloneSubterm(node, allowRewrite, path);
                        });
                    } finally {
                        path.pop();
                    }
                };
                cloneSubterm = function(subterm, allowRewrite, path) {
                    if (subterm instanceof Array) {
                        return cloneArray(subterm, allowRewrite, path);
                    } else if (subterm instanceof Function) {
                        return subterm;
                    } else if (subterm instanceof Object) {
                        return cloneNode(subterm, allowRewrite && !limit(subterm, {
                            path: path
                        }), path);
                    } else {
                        return subterm;
                    }
                };
                return cloneSubterm(self, true, []);
            },
            isDerivedFrom: function(ancestorNode) {
                var self = this;
                return self.setLocation(ancestorNode.location());
            },
            rewrite: function(options) {
                var self = this;
                options = options || {};
                options.createObject = function(node) {
                    var self = this;
                    return node;
                };
                return self.clone(options);
            },
            children: function() {
                var self = this;
                var children, addMember, addMembersInObject;
                children = [];
                addMember = function(member) {
                    var gen2_items, gen3_i, item;
                    if (member instanceof Node) {
                        return children.push(member);
                    } else if (member instanceof Array) {
                        gen2_items = member;
                        for (gen3_i = 0; gen3_i < gen2_items.length; ++gen3_i) {
                            item = gen2_items[gen3_i];
                            addMember(item);
                        }
                        return void 0;
                    } else if (member instanceof Object) {
                        return addMembersInObject(member);
                    }
                };
                addMembersInObject = function(object) {
                    var property;
                    for (property in object) {
                        (function(property) {
                            var member;
                            if (object.hasOwnProperty(property)) {
                                member = object[property];
                                addMember(member);
                            }
                        })(property);
                    }
                    return void 0;
                };
                addMembersInObject(self);
                return children;
            },
            walkDescendants: function(walker, gen4_options) {
                var self = this;
                var limit;
                limit = gen4_options !== void 0 && Object.prototype.hasOwnProperty.call(gen4_options, "limit") && gen4_options.limit !== void 0 ? gen4_options.limit : function() {
                    return false;
                };
                var path, walkChildren;
                path = [];
                walkChildren = function(node) {
                    var gen5_items, gen6_i, child;
                    try {
                        path.push(node);
                        gen5_items = node.children();
                        for (gen6_i = 0; gen6_i < gen5_items.length; ++gen6_i) {
                            child = gen5_items[gen6_i];
                            walker(child, path);
                            if (!limit(child, path)) {
                                walkChildren(child);
                            }
                        }
                        return void 0;
                    } finally {
                        path.pop();
                    }
                };
                return walkChildren(self);
            },
            walkDescendantsNotBelowIf: function(walker, limit) {
                var self = this;
                return self.walkDescendants(walker, {
                    limit: limit
                });
            },
            reduceWithReducedChildrenInto: function(reducer, gen7_options) {
                var self = this;
                var limit, cacheName;
                limit = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "limit") && gen7_options.limit !== void 0 ? gen7_options.limit : function(term) {
                    return false;
                };
                cacheName = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "cacheName") && gen7_options.cacheName !== void 0 ? gen7_options.cacheName : void 0;
                var path, cachingReducer, mapReduceChildren;
                path = [];
                cachingReducer = function() {
                    if (cacheName) {
                        return function(node, reducedChildren) {
                            var reducedValue;
                            if (node.hasOwnProperty("reductionCache")) {
                                if (node.reductionCache.hasOwnProperty(cacheName)) {
                                    return node.reductionCache[cacheName];
                                }
                            } else {
                                reducedValue = reducer(node, reducedChildren);
                                if (!node.hasOwnProperty("reductionCache")) {
                                    node.reductionCache = {};
                                }
                                node.reductionCache[cacheName] = reducedValue;
                                return reducedValue;
                            }
                        };
                    } else {
                        return reducer;
                    }
                }();
                mapReduceChildren = function(node) {
                    var mappedChildren, gen8_items, gen9_i, child;
                    try {
                        path.push(node);
                        mappedChildren = [];
                        gen8_items = node.children();
                        for (gen9_i = 0; gen9_i < gen8_items.length; ++gen9_i) {
                            child = gen8_items[gen9_i];
                            if (!limit(child, path)) {
                                mappedChildren.push(mapReduceChildren(child));
                            }
                        }
                        return cachingReducer(node, mappedChildren);
                    } finally {
                        path.pop();
                    }
                };
                return mapReduceChildren(self);
            }
        });
        Term = classExtending(Node, {
            generateJavaScriptStatement: function(buffer, scope) {
                var self = this;
                self.generateJavaScript(buffer, scope);
                return buffer.write(";");
            },
            arguments: function() {
                var self = this;
                return self;
            },
            inspectTerm: function(gen10_options) {
                var self = this;
                var depth;
                depth = gen10_options !== void 0 && Object.prototype.hasOwnProperty.call(gen10_options, "depth") && gen10_options.depth !== void 0 ? gen10_options.depth : 20;
                return util.inspect(self, false, depth);
            },
            show: function(gen11_options) {
                var self = this;
                var desc, depth;
                desc = gen11_options !== void 0 && Object.prototype.hasOwnProperty.call(gen11_options, "desc") && gen11_options.desc !== void 0 ? gen11_options.desc : void 0;
                depth = gen11_options !== void 0 && Object.prototype.hasOwnProperty.call(gen11_options, "depth") && gen11_options.depth !== void 0 ? gen11_options.depth : 20;
                if (desc) {
                    return console.log(desc, self.inspectTerm({
                        depth: depth
                    }));
                } else {
                    return console.log(self.inspectTerm({
                        depth: depth
                    }));
                }
            },
            hashEntry: function() {
                var self = this;
                return self.cg.errors.addTermWithMessage(self, "cannot be used as a hash entry");
            },
            hashEntryField: function() {
                var self = this;
                return self.cg.errors.addTermWithMessage(self, "cannot be used as a field name");
            },
            blockify: function(parameters, gen12_options) {
                var self = this;
                var optionalParameters, async;
                optionalParameters = gen12_options !== void 0 && Object.prototype.hasOwnProperty.call(gen12_options, "optionalParameters") && gen12_options.optionalParameters !== void 0 ? gen12_options.optionalParameters : void 0;
                async = gen12_options !== void 0 && Object.prototype.hasOwnProperty.call(gen12_options, "async") && gen12_options.async !== void 0 ? gen12_options.async : false;
                return self.cg.block(parameters, self.cg.asyncStatements([ self ]), {
                    optionalParameters: optionalParameters,
                    async: async
                });
            },
            scopify: function() {
                var self = this;
                return self;
            },
            parameter: function() {
                var self = this;
                return this.cg.errors.addTermWithMessage(self, "this cannot be used as a parameter");
            },
            subterms: function() {
                var self = this;
                return void 0;
            },
            expandMacro: function() {
                var self = this;
                return void 0;
            },
            expandMacros: function() {
                var self = this;
                return self.clone({
                    rewrite: function(term, gen13_options) {
                        var clone;
                        clone = gen13_options !== void 0 && Object.prototype.hasOwnProperty.call(gen13_options, "clone") && gen13_options.clone !== void 0 ? gen13_options.clone : void 0;
                        return term.expandMacro(clone);
                    }
                });
            },
            rewriteStatements: function() {
                var self = this;
                return void 0;
            },
            rewriteAllStatements: function() {
                var self = this;
                return self.clone({
                    rewrite: function(term, gen14_options) {
                        var clone;
                        clone = gen14_options !== void 0 && Object.prototype.hasOwnProperty.call(gen14_options, "clone") && gen14_options.clone !== void 0 ? gen14_options.clone : void 0;
                        return term.rewriteStatements(clone);
                    }
                });
            },
            serialiseSubStatements: function() {
                var self = this;
                return void 0;
            },
            serialiseStatements: function() {
                var self = this;
                return void 0;
            },
            serialiseAllStatements: function() {
                var self = this;
                return self.rewrite({
                    rewrite: function(term) {
                        return term.serialiseStatements();
                    }
                });
            },
            declareVariables: function() {
                var self = this;
                return void 0;
            },
            canonicalName: function() {
                var self = this;
                return void 0;
            },
            makeAsyncWithCallbackForResult: function(createCallbackForResult) {
                var self = this;
                return void 0;
            },
            containsContinuation: function() {
                var self = this;
                var found;
                found = false;
                self.walkDescendants(function(term) {
                    return found = term.isContinuation || found;
                }, {
                    limit: function(term) {
                        return term.isClosure && term.isAsync;
                    }
                });
                return found;
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                if (self.containsContinuation()) {
                    return self;
                } else {
                    return returnTerm(self);
                }
            },
            asyncify: function() {
                var self = this;
                return void 0;
            }
        });
        termPrototype = new Term;
        term = function(members) {
            var termConstructor;
            termConstructor = classExtending(Term, members);
            return function() {
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen15_c;
                gen15_c = function() {
                    termConstructor.apply(this, args);
                };
                gen15_c.prototype = termConstructor.prototype;
                return new gen15_c;
            };
        };
        return {
            Node: Node,
            Term: Term,
            term: term,
            termPrototype: termPrototype
        };
    };
}).call(this);
});

require.define("/lib/class.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    global.$class = function(prototype) {
        var self = this;
        var constructor;
        constructor = function() {
            var self = this;
            var args = Array.prototype.slice.call(arguments, 0, arguments.length);
            prototype.constructor.apply(self, args);
            return void 0;
        };
        constructor.prototype = prototype;
        return constructor;
    };
    global.classExtending = function(baseConstructor, prototypeMembers) {
        var self = this;
        var prototypeConstructor, prototype, constructor;
        prototypeConstructor = function() {
            var self = this;
            var field;
            for (field in prototypeMembers) {
                (function(field) {
                    if (prototypeMembers.hasOwnProperty(field)) {
                        self[field] = prototypeMembers[field];
                    }
                })(field);
            }
            return void 0;
        };
        prototypeConstructor.prototype = baseConstructor.prototype;
        prototype = new prototypeConstructor;
        constructor = function() {
            var self = this;
            var args = Array.prototype.slice.call(arguments, 0, arguments.length);
            prototype.constructor.apply(self, args);
            return void 0;
        };
        constructor.prototype = prototype;
        return constructor;
    };
}).call(this);
});

require.define("util",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  return d instanceof Date;
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

});

require.define("events",function(require,module,exports,__dirname,__filename,process,global){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("/lib/terms/throwStatement.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(expr) {
                var self = this;
                self.isThrow = true;
                return self.expression = expr;
            },
            generateJavaScriptStatement: function(buffer, scope) {
                var self = this;
                buffer.write("throw ");
                self.expression.generateJavaScript(buffer, scope);
                return buffer.write(";");
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                return self;
            }
        });
    };
}).call(this);
});

require.define("/lib/terms/tryExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var asyncControl;
    asyncControl = require("../asyncControl");
    module.exports = function(terms) {
        var self = this;
        var tryExpressionTerm, tryExpression;
        tryExpressionTerm = terms.term({
            constructor: function(body, gen1_options) {
                var self = this;
                var catchBody, catchParameter, finallyBody;
                catchBody = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "catchBody") && gen1_options.catchBody !== void 0 ? gen1_options.catchBody : void 0;
                catchParameter = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "catchParameter") && gen1_options.catchParameter !== void 0 ? gen1_options.catchParameter : void 0;
                finallyBody = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "finallyBody") && gen1_options.finallyBody !== void 0 ? gen1_options.finallyBody : void 0;
                self.isTryExpression = true;
                self.body = body;
                self.catchBody = catchBody;
                self.catchParameter = catchParameter;
                return self.finallyBody = finallyBody;
            },
            generateJavaScriptStatement: function(buffer, scope, returnStatements) {
                var self = this;
                buffer.write("try{");
                if (returnStatements) {
                    self.body.generateJavaScriptStatementsReturn(buffer, scope);
                } else {
                    self.body.generateJavaScriptStatements(buffer, scope);
                }
                buffer.write("}");
                if (self.catchBody) {
                    buffer.write("catch(");
                    self.catchParameter.generateJavaScript(buffer, scope);
                    buffer.write("){");
                    if (returnStatements) {
                        self.catchBody.generateJavaScriptStatementsReturn(buffer, scope);
                    } else {
                        self.catchBody.generateJavaScriptStatements(buffer, scope);
                    }
                    buffer.write("}");
                }
                if (self.finallyBody) {
                    buffer.write("finally{");
                    self.finallyBody.generateJavaScriptStatements(buffer, scope);
                    return buffer.write("}");
                }
            },
            generateJavaScript: function(buffer, symbolScope) {
                var self = this;
                if (self.alreadyCalled) {
                    throw new Error("stuff");
                }
                self.alreadyCalled = true;
                return self.cg.scope([ self ], {
                    alwaysGenerateFunction: true
                }).generateJavaScript(buffer, symbolScope);
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                self.body.rewriteResultTermInto(returnTerm);
                if (self.catchBody) {
                    self.catchBody.rewriteResultTermInto(returnTerm);
                }
                return self;
            }
        });
        return tryExpression = function(body, gen2_options) {
            var catchBody, catchParameter, finallyBody;
            catchBody = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "catchBody") && gen2_options.catchBody !== void 0 ? gen2_options.catchBody : void 0;
            catchParameter = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "catchParameter") && gen2_options.catchParameter !== void 0 ? gen2_options.catchParameter : void 0;
            finallyBody = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "finallyBody") && gen2_options.finallyBody !== void 0 ? gen2_options.finallyBody : void 0;
            var asyncTryFunction;
            if (body.isAsync || catchBody && catchBody.isAsync || finallyBody && finallyBody.isAsync) {
                asyncTryFunction = terms.moduleConstants.defineAs([ "async", "try" ], terms.javascript(asyncControl.try.toString()));
                return terms.functionCall(asyncTryFunction, [ terms.argumentUtils.asyncifyBody(body), terms.argumentUtils.asyncifyBody(catchBody, [ catchParameter ]), terms.argumentUtils.asyncifyBody(finallyBody) ], {
                    async: true
                });
            } else {
                return tryExpressionTerm(body, {
                    catchBody: catchBody,
                    catchParameter: catchParameter,
                    finallyBody: finallyBody
                });
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/typeof.js",function(require,module,exports,__dirname,__filename,process,global){exports.typeof = function (expression, type) {
  return this.term(function () {
    this.isInstanceOf = true;
    this.expression = expression;
    this.type = type;

    this.generateJavaScript = function (buffer, scope) {
        buffer.write("(typeof(");
        this.expression.generateJavaScript(buffer, scope);
        buffer.write(") === '" + this.type + "')");
    };
  });
};

});

require.define("/lib/terms/variable.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("./codegenUtils");
    module.exports = function(terms) {
        var self = this;
        var variableTerm, variable;
        variableTerm = terms.term({
            constructor: function(name, gen1_options) {
                var self = this;
                var location;
                location = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "location") && gen1_options.location !== void 0 ? gen1_options.location : void 0;
                self.variable = name;
                self.isVariable = true;
                return self.setLocation(location);
            },
            canonicalName: function() {
                var self = this;
                return codegenUtils.concatName(self.variable, {
                    escape: true
                });
            },
            displayName: function() {
                var self = this;
                return self.variable.join(" ");
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                return buffer.write(this.canonicalName());
            },
            generateJavaScriptTarget: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen2_o;
                gen2_o = self;
                return gen2_o.generateJavaScript.apply(gen2_o, args);
            },
            hashEntryField: function() {
                var self = this;
                return self.variable;
            },
            generateJavaScriptParameter: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen3_o;
                gen3_o = self;
                return gen3_o.generateJavaScript.apply(gen3_o, args);
            },
            parameter: function() {
                var self = this;
                return self;
            }
        });
        return variable = function(name, gen4_options) {
            var couldBeMacro, location;
            couldBeMacro = gen4_options !== void 0 && Object.prototype.hasOwnProperty.call(gen4_options, "couldBeMacro") && gen4_options.couldBeMacro !== void 0 ? gen4_options.couldBeMacro : true;
            location = gen4_options !== void 0 && Object.prototype.hasOwnProperty.call(gen4_options, "location") && gen4_options.location !== void 0 ? gen4_options.location : void 0;
            var v, macro;
            v = variableTerm(name, {
                location: location
            });
            if (couldBeMacro) {
                macro = terms.macros.findMacro(name);
                if (macro) {
                    return macro(v, name);
                }
            }
            return v;
        };
    };
}).call(this);
});

require.define("/lib/terms/whileExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var asyncControl;
    asyncControl = require("../asyncControl");
    module.exports = function(terms) {
        var self = this;
        var whileExpressionTerm, whileExpression;
        whileExpressionTerm = terms.term({
            constructor: function(condition, statements) {
                var self = this;
                self.isWhile = true;
                self.condition = condition;
                return self.statements = statements;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("while(");
                self.condition.generateJavaScript(buffer, scope);
                buffer.write("){");
                self.statements.generateJavaScriptStatements(buffer, scope);
                return buffer.write("}");
            },
            generateJavaScriptStatement: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen1_o;
                gen1_o = self;
                return gen1_o.generateJavaScript.apply(gen1_o, args);
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                return void 0;
            }
        });
        return whileExpression = function(condition, statements) {
            var conditionStatements, asyncWhileFunction;
            conditionStatements = terms.asyncStatements([ condition ]);
            if (statements.isAsync || conditionStatements.isAsync) {
                asyncWhileFunction = terms.moduleConstants.defineAs([ "async", "while" ], terms.javascript(asyncControl.while.toString()));
                return terms.functionCall(asyncWhileFunction, [ terms.argumentUtils.asyncifyBody(conditionStatements), terms.argumentUtils.asyncifyBody(statements) ], {
                    async: true
                });
            } else {
                return whileExpressionTerm(condition, statements);
            }
        };
    };
}).call(this);
});

require.define("/lib/terms/withExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    module.exports = function(terms) {
        var self = this;
        var withExpressionTerm, withExpression;
        withExpressionTerm = terms.term({
            constructor: function(subject, statements) {
                var self = this;
                self.isWith = true;
                self.subject = subject;
                return self.statements = statements;
            },
            generateJavaScript: function(buffer, scope) {
                var self = this;
                buffer.write("with(");
                self.subject.generateJavaScript(buffer, scope);
                buffer.write("){");
                self.statements.generateJavaScriptStatements(buffer, scope);
                return buffer.write("}");
            },
            generateJavaScriptStatement: function() {
                var self = this;
                var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                var gen1_o;
                gen1_o = self;
                return gen1_o.generateJavaScript.apply(gen1_o, args);
            },
            rewriteResultTermInto: function(returnTerm) {
                var self = this;
                return self;
            }
        });
        return withExpression = function(subject, statements) {
            return withExpressionTerm(subject, statements);
        };
    };
}).call(this);
});

require.define("/lib/codeGenerator.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var util = require('util');
require('./parser/runtime');
var codegenUtils = require('./terms/codegenUtils');

var loc = exports.loc = function (term, location) {
  var loc = {
    firstLine: location.firstLine,
    lastLine: location.lastLine,
    firstColumn: location.firstColumn,
    lastColumn: location.lastColumn
  };

  term.location = function () {
    return loc;
  };
  
  return term;
};

exports.oldTerm = function (members) {
  var cg = this;
  
  var constructor = function () {
    members.call(this);
  };
  constructor.prototype = cg.termPrototype;
  return new constructor();
};

});

require.define("/lib/parser/runtime.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var constructor;
    constructor = function(members) {
        if (members instanceof Function) {
            return function() {
                var self = this;
                members.call(self);
                return undefined;
            };
        } else {
            return function() {
                var self = this;
                var member;
                for (member in members) {
                    (function(member) {
                        if (members.hasOwnProperty(member)) {
                            self[member] = members[member];
                        }
                    })(member);
                }
                return void 0;
            };
        }
    };
    global.object = function(members) {
        var self = this;
        var c;
        c = constructor(members);
        return new c;
    };
    global.objectExtending = function(base, members) {
        var self = this;
        var c;
        c = constructor(members);
        c.prototype = base;
        return new c;
    };
}).call(this);
});

require.define("/lib/debugPogo.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var removeFrom, moveToHeadOf, nodeArguments;
    removeFrom = function(arg, args) {
        var index, rest, gen1_o;
        index = args.indexOf(arg);
        if (index > -1) {
            rest = args.slice(index + 1);
            args.length = index;
            gen1_o = args;
            return gen1_o.push.apply(gen1_o, rest);
        }
    };
    moveToHeadOf = function(arg, args) {
        removeFrom(arg, args);
        return args.unshift(arg);
    };
    nodeArguments = function() {
        var args;
        args = process.argv.slice(1);
        if (options.debug) {
            moveToHeadOf("--debug", args);
        }
        if (options.debugBrk) {
            moveToHeadOf("--debug-brk", args);
        }
        if (options._[0] === "debug") {
            moveToHeadOf("debug", args);
        }
        return args;
    }();
    exports.debugPogo = function() {
        var self = this;
        var childProcess;
        childProcess = require("child_process");
        return childProcess.spawn(process.argv[0], nodeArguments, {
            customFds: [ 0, 1, 2 ]
        });
    };
}).call(this);
});

require.define("child_process",function(require,module,exports,__dirname,__filename,process,global){exports.spawn = function () {};
exports.exec = function () {};

});

require.define("/lib/macroDirectory.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _;
    _ = require("underscore");
    module.exports = function(terms) {
        var self = this;
        var macroDirectory, createMacroDirectory;
        macroDirectory = $class({
            constructor: function() {
                var self = this;
                return self.nameTreeRoot = {};
            },
            nameNode: function(name) {
                var self = this;
                var nameTree;
                nameTree = self.nameTreeRoot;
                _(name).each(function(nameSegment) {
                    if (!nameTree.hasOwnProperty(nameSegment)) {
                        return nameTree = nameTree[nameSegment] = {};
                    } else {
                        return nameTree = nameTree[nameSegment];
                    }
                });
                return nameTree;
            },
            addMacro: function(name, createMacro) {
                var self = this;
                var nameTree;
                nameTree = self.nameNode(name);
                return nameTree["create macro"] = createMacro;
            },
            addWildCardMacro: function(name, matchMacro) {
                var self = this;
                var nameTree, matchMacros;
                nameTree = self.nameNode(name);
                matchMacros = void 0;
                if (!nameTree.hasOwnProperty("match macro")) {
                    matchMacros = nameTree["match macro"] = [];
                } else {
                    matchMacros = nameTree["match macro"];
                }
                return matchMacros.push(matchMacro);
            },
            findMacro: function(name) {
                var self = this;
                var findMatchingWildMacro, findMacroInTree;
                findMatchingWildMacro = function(wildMacros, name) {
                    var n, wildMacro, macro;
                    n = 0;
                    while (n < wildMacros.length) {
                        wildMacro = wildMacros[n];
                        macro = wildMacro(name);
                        if (macro) {
                            return macro;
                        }
                        ++n;
                    }
                    return void 0;
                };
                findMacroInTree = function(nameTree, name, index, wildMacros) {
                    var subtree;
                    if (index < name.length) {
                        if (nameTree.hasOwnProperty(name[index])) {
                            subtree = nameTree[name[index]];
                            if (subtree.hasOwnProperty("match macro")) {
                                wildMacros = subtree["match macro"].concat(wildMacros);
                            }
                            return findMacroInTree(subtree, name, index + 1, wildMacros);
                        } else {
                            return findMatchingWildMacro(wildMacros, name);
                        }
                    } else {
                        if (nameTree.hasOwnProperty("create macro")) {
                            return nameTree["create macro"];
                        } else {
                            return findMatchingWildMacro(wildMacros, name);
                        }
                    }
                };
                return findMacroInTree(self.nameTreeRoot, name, 0, []);
            }
        });
        return createMacroDirectory = function() {
            var args = Array.prototype.slice.call(arguments, 0, arguments.length);
            var gen1_c;
            gen1_c = function() {
                macroDirectory.apply(this, args);
            };
            gen1_c.prototype = macroDirectory.prototype;
            return new gen1_c;
        };
    };
}).call(this);
});

require.define("/lib/memorystream.js",function(require,module,exports,__dirname,__filename,process,global){var MemoryStream = function () {
  var buffer = [];
  
  this.write = function (str) {
    if (typeof str === 'undefined') {
      throw new Error('wrote undefined');
    }
    buffer.push(str);
  };
  
  var totalSizeOfBuffer = function () {
    var size = 0;
    
    for (var n in buffer) {
      size += buffer[n].length;
    }
    
    return size;
  };
  
  this.toString = function () {
    var str = "";
    
    for (var n in buffer) {
      str += buffer[n];
    }
    
    return str;
  };
};

exports.MemoryStream = MemoryStream;

});

require.define("/lib/moduleConstants.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("./terms/codegenUtils");
    module.exports = function(terms) {
        var self = this;
        var moduleConstants;
        return moduleConstants = $class({
            constructor: function() {
                var self = this;
                return self.namedDefinitions = {};
            },
            defineAs: function(name, expression) {
                var self = this;
                var canonicalName, existingDefinition, variable;
                canonicalName = codegenUtils.concatName(name);
                existingDefinition = self.namedDefinitions[canonicalName];
                if (existingDefinition) {
                    return existingDefinition.target;
                } else {
                    variable = terms.generatedVariable(name);
                    self.namedDefinitions[canonicalName] = terms.definition(variable, expression);
                    return variable;
                }
            },
            definitions: function() {
                var self = this;
                var defs, name;
                defs = [];
                for (name in self.namedDefinitions) {
                    (function(name) {
                        var definition;
                        definition = self.namedDefinitions[name];
                        defs.push(definition);
                    })(name);
                }
                return defs;
            }
        });
    };
}).call(this);
});

require.define("/lib/optionParser.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var BooleanOption, OptionParser;
    require("./class");
    BooleanOption = $class({
        constructor: function(gen1_options) {
            var self = this;
            var shortName, longName, description;
            shortName = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "shortName") && gen1_options.shortName !== void 0 ? gen1_options.shortName : void 0;
            longName = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "longName") && gen1_options.longName !== void 0 ? gen1_options.longName : void 0;
            description = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "description") && gen1_options.description !== void 0 ? gen1_options.description : void 0;
            self.shortName = shortName;
            self.name = self._camelCaseName(longName);
            self.longName = longName;
            return self.description = description;
        },
        _camelCaseName: function(longName) {
            var self = this;
            var segments, name, n, segment;
            segments = longName.split(/-/);
            name = segments[0];
            for (n = 1; n < segments.length; ++n) {
                segment = segments[n];
                name = name + (segment[0].toUpperCase() + segment.substring(1));
            }
            return name;
        },
        init: function(options) {
            var self = this;
            return options[self.name] = false;
        },
        set: function(options) {
            var self = this;
            return options[self.name] = true;
        },
        toString: function() {
            var self = this;
            var switches;
            switches = [ function() {
                if (self.shortName) {
                    return "-" + self.shortName;
                }
            }(), function() {
                if (self.longName) {
                    return "--" + self.longName;
                }
            }() ].filter(function(s) {
                return s;
            }).join(", ");
            return "    " + switches + "\n\n        " + self.description + "\n";
        }
    });
    OptionParser = $class({
        constructor: function() {
            var self = this;
            self._longOptions = {};
            self._shortOptions = {};
            return self._options = [];
        },
        option: function(description) {
            var self = this;
            var match, shortName, longName, option;
            match = /(-([a-z0-9])\s*,\s*)?--([a-z0-9-]*)\s*(.*)/i.exec(description);
            if (!match) {
                throw new Error("expected option be of the form '[-x, ]--xxxx some description of xxxx'");
            }
            shortName = match[2];
            longName = match[3];
            option = new BooleanOption({
                shortName: shortName,
                longName: longName,
                description: match[4]
            });
            return self._addOption(option);
        },
        _addOption: function(option) {
            var self = this;
            self._longOptions[option.longName] = option;
            self._shortOptions[option.shortName] = option;
            return self._options.push(option);
        },
        _findLongOption: function(name) {
            var self = this;
            var option;
            option = self._longOptions[name];
            if (option) {
                return option;
            } else {
                throw new Error("no such option --" + name);
            }
        },
        _findShortOption: function(name) {
            var self = this;
            var option;
            option = self._shortOptions[name];
            if (option) {
                return option;
            } else {
                throw new Error("no such option -" + name);
            }
        },
        _setDefaultOptions: function(options) {
            var self = this;
            var gen2_items, gen3_i, option;
            gen2_items = self._options;
            for (gen3_i = 0; gen3_i < gen2_items.length; ++gen3_i) {
                option = gen2_items[gen3_i];
                option.init(options);
            }
            return void 0;
        },
        parse: function(args) {
            var self = this;
            var options, n, gen4_forResult;
            if (!args) {
                args = process.argv;
            }
            options = {
                _: []
            };
            self._setDefaultOptions(options);
            for (n = 0; n < args.length; ++n) {
                gen4_forResult = void 0;
                if (function(n) {
                    var arg, longMatch, shortMatch, option, gen5_items, gen6_i, shortOption, gen7_o;
                    arg = args[n];
                    longMatch = /^--([a-z0-9-]*)$/.exec(arg);
                    shortMatch = /^-([a-z0-9-]*)$/.exec(arg);
                    option = void 0;
                    if (longMatch) {
                        option = self._findLongOption(longMatch[1]);
                        option.set(options);
                    } else if (shortMatch) {
                        gen5_items = shortMatch[1];
                        for (gen6_i = 0; gen6_i < gen5_items.length; ++gen6_i) {
                            shortOption = gen5_items[gen6_i];
                            option = self._findShortOption(shortOption);
                            option.set(options);
                        }
                    } else {
                        gen7_o = options._;
                        gen7_o.push.apply(gen7_o, args.slice(n));
                        gen4_forResult = options;
                        return true;
                    }
                }(n)) {
                    return gen4_forResult;
                }
            }
            return options;
        },
        help: function() {
            var self = this;
            var gen8_items, gen9_i, option;
            process.stdout.write("usage:\n\n    pogo [debug] script.pogo [script options]\n    pogo [options] scripts ...\n\noptions:\n\n");
            gen8_items = self._options;
            for (gen9_i = 0; gen9_i < gen8_items.length; ++gen9_i) {
                option = gen8_items[gen9_i];
                process.stdout.write(option + "\n");
            }
            return void 0;
        }
    });
    exports.createParser = function() {
        var self = this;
        return new OptionParser;
    };
}).call(this);
});

require.define("/lib/symbolScope.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var UniqueNames, SymbolScope;
    UniqueNames = function() {
        var self = this;
        var unique;
        unique = 0;
        self.generateName = function(name) {
            var self = this;
            unique = unique + 1;
            return "gen" + unique + "_" + name;
        };
        return void 0;
    };
    SymbolScope = exports.SymbolScope = function(parentScope, gen1_options) {
        var self = this;
        var uniqueNames;
        uniqueNames = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "uniqueNames") && gen1_options.uniqueNames !== void 0 ? gen1_options.uniqueNames : new UniqueNames;
        var variables;
        variables = {};
        self.define = function(name) {
            var self = this;
            return variables[name] = true;
        };
        self.generateVariable = function(name) {
            var self = this;
            return uniqueNames.generateName(name);
        };
        self.isDefined = function(name) {
            var self = this;
            return variables.hasOwnProperty(name) || parentScope && parentScope.isDefined(name);
        };
        self.subScope = function() {
            var self = this;
            return new SymbolScope(self, {
                uniqueNames: uniqueNames
            });
        };
        return void 0;
    };
}).call(this);
});

require.define("/lib/versions.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _;
    _ = require("underscore");
    exports.isLessThan = function(a, b) {
        var self = this;
        var parseVersion, compare, gen1_items, gen2_i, gen3_forResult;
        parseVersion = function(v) {
            if (v[0] === "v") {
                v = v.substring(1);
            }
            return v.split(".");
        };
        compare = function(v1, v2) {
            if (v1 > v2) {
                return 1;
            } else if (v2 > v1) {
                return -1;
            } else {
                return 0;
            }
        };
        gen1_items = _.zip(parseVersion(a), parseVersion(b));
        for (gen2_i = 0; gen2_i < gen1_items.length; ++gen2_i) {
            gen3_forResult = void 0;
            if (function(gen2_i) {
                var versionNumbers, comparison;
                versionNumbers = gen1_items[gen2_i];
                comparison = compare(versionNumbers[0], versionNumbers[1]);
                if (comparison) {
                    gen3_forResult = comparison < 0;
                    return true;
                }
            }(gen2_i)) {
                return gen3_forResult;
            }
        }
        return false;
    };
}).call(this);
});

require.define("/node_modules/should/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./lib/should.js"}
});

require.define("/node_modules/should/lib/should.js",function(require,module,exports,__dirname,__filename,process,global){
/*!
 * Should
 * Copyright(c) 2010-2012 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var util = require('util')
  , http = require('http')
  , assert = require('assert')
  , AssertionError = assert.AssertionError
  , statusCodes = http.STATUS_CODES
  , eql = require('./eql')
  , i = util.inspect;

/**
 * Expose assert as should.
 *
 * This allows you to do things like below
 * without require()ing the assert module.
 *
 *    should.equal(foo.bar, undefined);
 *
 */

exports = module.exports = assert;

/**
 * Library version.
 */

exports.version = '0.6.3';

/**
 * Assert _obj_ exists, with optional message.
 *
 * @param {Mixed} obj
 * @param {String} [msg]
 * @api public
 */

exports.exist = function(obj, msg){
  if (null == obj) {
    throw new AssertionError({
        message: msg || ('expected ' + i(obj) + ' to exist')
      , stackStartFunction: should.exist
    });
  }
};

/**
 * Asserts _obj_ does not exist, with optional message.
 *
 * @param {Mixed} obj
 * @param {String} [msg]
 * @api public
 */

exports.not = {};
exports.not.exist = function(obj, msg){
  if (null != obj) {
    throw new AssertionError({
        message: msg || ('expected ' + i(obj) + ' to not exist')
      , stackStartFunction: should.not.exist
    });
  }
};

/**
 * Expose api via `Object#should`.
 *
 * @api public
 */

Object.defineProperty(Object.prototype, 'should', {
  set: function(){},
  get: function(){
    return new Assertion(Object(this).valueOf());
  },
  configurable: true
});

/**
 * Initialize a new `Assertion` with the given _obj_.
 *
 * @param {Mixed} obj
 * @api private
 */

var Assertion = exports.Assertion = function Assertion(obj) {
  this.obj = obj;
};

/**
 * Prototype.
 */

Assertion.prototype = {

  /**
   * HACK: prevents double require() from failing.
   */

  exports: exports,

  /**
   * Assert _expr_ with the given _msg_ and _negatedMsg_.
   *
   * @param {Boolean} expr
   * @param {String} msg
   * @param {String} negatedMsg
   * @param {Object} expected
   * @api private
   */

  assert: function(expr, msg, negatedMsg, expected){
    var msg = this.negate ? negatedMsg : msg
      , ok = this.negate ? !expr : expr;

    if (!ok) {
      throw new AssertionError({
          message: msg
        , actual: this.obj
        , expected: expected
        , stackStartFunction: this.assert
      });
    }
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get an() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get and() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get be() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get have() {
    return this;
  },

  /**
   * Dummy getter.
   *
   * @api public
   */

  get with() {
    return this;
  },

  /**
   * Negation modifier.
   *
   * @api public
   */

  get not() {
    this.negate = true;
    return this;
  },

  /**
   * Get object inspection string.
   *
   * @return {String}
   * @api private
   */

  get inspect() {
    return i(this.obj);
  },

  /**
   * Assert instanceof `Arguments`.
   *
   * @api public
   */

  get arguments() {
    this.assert(
        '[object Arguments]' == Object.prototype.toString.call(this.obj)
      , 'expected ' + this.inspect + ' to be arguments'
      , 'expected ' + this.inspect + ' to not be arguments');
    return this;
  },

  /**
   * Assert that an object is empty aka length of 0.
   *
   * @api public
   */

  get empty() {
    this.obj.should.have.property('length');
    this.assert(
        0 === this.obj.length
      , 'expected ' + this.inspect + ' to be empty'
      , 'expected ' + this.inspect + ' not to be empty');
    return this;
  },

  /**
   * Assert ok.
   *
   * @api public
   */

  get ok() {
    this.assert(
        this.obj
      , 'expected ' + this.inspect + ' to be truthy'
      , 'expected ' + this.inspect + ' to be falsey');
    return this;
  },

  /**
   * Assert true.
   *
   * @api public
   */

  get true() {
    this.assert(
        true === this.obj
      , 'expected ' + this.inspect + ' to be true'
      , 'expected ' + this.inspect + ' not to be true');
    return this;
  },

  /**
   * Assert false.
   *
   * @api public
   */

  get false() {
    this.assert(
        false === this.obj
      , 'expected ' + this.inspect + ' to be false'
      , 'expected ' + this.inspect + ' not to be false');
    return this;
  },

  /**
   * Assert equal.
   *
   * @param {Mixed} val
   * @param {String} description
   * @api public
   */

  eql: function(val, desc){
    this.assert(
        eql(val, this.obj)
      , 'expected ' + this.inspect + ' to equal ' + i(val) + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to not equal ' + i(val) + (desc ? " | " + desc : "")
      , val);
    return this;
  },

  /**
   * Assert strict equal.
   *
   * @param {Mixed} val
   * @param {String} description
   * @api public
   */

  equal: function(val, desc){
    this.assert(
        val.valueOf() === this.obj
      , 'expected ' + this.inspect + ' to equal ' + i(val) + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to not equal ' + i(val) + (desc ? " | " + desc : "")
      , val);
    return this;
  },

  /**
   * Assert within start to finish (inclusive).
   *
   * @param {Number} start
   * @param {Number} finish
   * @param {String} description
   * @api public
   */

  within: function(start, finish, desc){
    var range = start + '..' + finish;
    this.assert(
        this.obj >= start && this.obj <= finish
      , 'expected ' + this.inspect + ' to be within ' + range + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to not be within ' + range + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert typeof.
   *
   * @param {Mixed} type
   * @param {String} description
   * @api public
   */

  a: function(type, desc){
    this.assert(
        type == typeof this.obj
      , 'expected ' + this.inspect + ' to be a ' + type + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' not to be a ' + type  + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert instanceof.
   *
   * @param {Function} constructor
   * @param {String} description
   * @api public
   */

  instanceof: function(constructor, desc){
    var name = constructor.name;
    this.assert(
        this.obj instanceof constructor
      , 'expected ' + this.inspect + ' to be an instance of ' + name + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' not to be an instance of ' + name + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert numeric value above _n_.
   *
   * @param {Number} n
   * @param {String} description
   * @api public
   */

  above: function(n, desc){
    this.assert(
        this.obj > n
      , 'expected ' + this.inspect + ' to be above ' + n + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to be below ' + n + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert numeric value below _n_.
   *
   * @param {Number} n
   * @param {String} description
   * @api public
   */

  below: function(n, desc){
    this.assert(
        this.obj < n
      , 'expected ' + this.inspect + ' to be below ' + n + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to be above ' + n + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert string value matches _regexp_.
   *
   * @param {RegExp} regexp
   * @param {String} description
   * @api public
   */

  match: function(regexp, desc){
    this.assert(
        regexp.exec(this.obj)
      , 'expected ' + this.inspect + ' to match ' + regexp + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' not to match ' + regexp + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert property "length" exists and has value of _n_.
   *
   * @param {Number} n
   * @param {String} description
   * @api public
   */

  length: function(n, desc){
    this.obj.should.have.property('length');
    var len = this.obj.length;
    this.assert(
        n == len
      , 'expected ' + this.inspect + ' to have a length of ' + n + ' but got ' + len + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to not have a length of ' + len + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert property _name_ exists, with optional _val_.
   *
   * @param {String} name
   * @param {Mixed} [val]
   * @param {String} description
   * @api public
   */

  property: function(name, val, desc){
    if (this.negate && undefined !== val) {
      if (undefined === this.obj[name]) {
        throw new Error(this.inspect + ' has no property ' + i(name) + (desc ? " | " + desc : ""));
      }
    } else {
      this.assert(
          undefined !== this.obj[name]
        , 'expected ' + this.inspect + ' to have a property ' + i(name) + (desc ? " | " + desc : "")
        , 'expected ' + this.inspect + ' to not have a property ' + i(name) + (desc ? " | " + desc : ""));
    }

    if (undefined !== val) {
      this.assert(
          val === this.obj[name]
        , 'expected ' + this.inspect + ' to have a property ' + i(name)
          + ' of ' + i(val) + ', but got ' + i(this.obj[name]) + (desc ? " | " + desc : "")
        , 'expected ' + this.inspect + ' to not have a property ' + i(name) + ' of ' + i(val) + (desc ? " | " + desc : ""));
    }

    this.obj = this.obj[name];
    return this;
  },

  /**
   * Assert own property _name_ exists.
   *
   * @param {String} name
   * @param {String} description
   * @api public
   */

  ownProperty: function(name, desc){
    this.assert(
        this.obj.hasOwnProperty(name)
      , 'expected ' + this.inspect + ' to have own property ' + i(name) + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to not have own property ' + i(name) + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert that `obj` is present via `.indexOf()`.
   *
   * @param {Mixed} obj
   * @param {String} description
   * @api public
   */

  include: function(obj, desc){
    if (obj.constructor == Object){
      var cmp = {};
      for (var key in obj) cmp[key] = this.obj[key];
      this.assert(
          eql(cmp, obj)
        , 'expected ' + this.inspect + ' to include an object equal to ' + i(obj) + (desc ? " | " + desc : "")
        , 'expected ' + this.inspect + ' to not include an object equal to ' + i(obj) + (desc ? " | " + desc : ""));
    } else {
      this.assert(
          ~this.obj.indexOf(obj)
        , 'expected ' + this.inspect + ' to include ' + i(obj) + (desc ? " | " + desc : "")
        , 'expected ' + this.inspect + ' to not include ' + i(obj) + (desc ? " | " + desc : ""));
    }
    return this;
  },

  /**
   * Assert that an object equal to `obj` is present.
   *
   * @param {Array} obj
   * @param {String} description
   * @api public
   */

  includeEql: function(obj, desc){
    this.assert(
      this.obj.some(function(item) { return eql(obj, item); })
      , 'expected ' + this.inspect + ' to include an object equal to ' + i(obj) + (desc ? " | " + desc : "")
      , 'expected ' + this.inspect + ' to not include an object equal to ' + i(obj) + (desc ? " | " + desc : ""));
    return this;
  },

  /**
   * Assert that the array contains _obj_.
   *
   * @param {Mixed} obj
   * @api public
   */

  contain: function(obj){
    console.warn('should.contain() is deprecated, use should.include()');
    this.obj.should.be.an.instanceof(Array);
    this.assert(
        ~this.obj.indexOf(obj)
      , 'expected ' + this.inspect + ' to contain ' + i(obj)
      , 'expected ' + this.inspect + ' to not contain ' + i(obj));
    return this;
  },

  /**
   * Assert exact keys or inclusion of keys by using
   * the `.include` modifier.
   *
   * @param {Array|String ...} keys
   * @api public
   */

  keys: function(keys){
    var str
      , ok = true;

    keys = keys instanceof Array
      ? keys
      : Array.prototype.slice.call(arguments);

    if (!keys.length) throw new Error('keys required');

    var actual = Object.keys(this.obj)
      , len = keys.length;

    // make sure they're all present
    ok = keys.every(function(key){
      return ~actual.indexOf(key);
    });

    // matching length
    ok = ok && keys.length == actual.length;

    // key string
    if (len > 1) {
      keys = keys.map(function(key){
        return i(key);
      });
      var last = keys.pop();
      str = keys.join(', ') + ', and ' + last;
    } else {
      str = i(keys[0]);
    }

    // message
    str = 'have ' + (len > 1 ? 'keys ' : 'key ') + str;

    this.assert(
        ok
      , 'expected ' + this.inspect + ' to ' + str
      , 'expected ' + this.inspect + ' to not ' + str);

    return this;
  },

  /**
   * Assert that header `field` has the given `val`.
   *
   * @param {String} field
   * @param {String} val
   * @return {Assertion} for chaining
   * @api public
   */

  header: function(field, val){
    this.obj.should
      .have.property('headers').and
      .have.property(field.toLowerCase(), val);
    return this;
  },

  /**
   * Assert `.statusCode` of `code`.
   *
   * @param {Number} code
   * @return {Assertion} for chaining
   * @api public
   */

  status:  function(code){
    this.obj.should.have.property('statusCode');
    var status = this.obj.statusCode;

    this.assert(
        code == status
      , 'expected response code of ' + code + ' ' + i(statusCodes[code])
        + ', but got ' + status + ' ' + i(statusCodes[status])
      , 'expected to not respond with ' + code + ' ' + i(statusCodes[code]));

    return this;
  },

  /**
   * Assert that this response has content-type: application/json.
   *
   * @return {Assertion} for chaining
   * @api public
   */

  get json() {
    this.obj.should.have.property('headers');
    this.obj.headers.should.have.property('content-type');
    this.obj.headers['content-type'].should.include('application/json');
    return this;
  },

  /**
   * Assert that this response has content-type: text/html.
   *
   * @return {Assertion} for chaining
   * @api public
   */

  get html() {
    this.obj.should.have.property('headers');
    this.obj.headers.should.have.property('content-type');
    this.obj.headers['content-type'].should.include('text/html');
    return this;
  },

  /**
   * Assert that this function will or will not
   * throw an exception.
   *
   * @return {Assertion} for chaining
   * @api public
   */

  throw: function(message){
    var fn = this.obj
      , err = {}
      , errorInfo = ''
      , ok = true;

    try {
      fn();
      ok = false;
    } catch (e) {
      err = e;
    }

    if (ok) {
      if ('string' == typeof message) {
        ok = message == err.message;
      } else if (message instanceof RegExp) {
        ok = message.test(err.message);
      }

      if (message && !ok) {
        if ('string' == typeof message) {
          errorInfo = " with a message matching '" + message + "', but got '" + err.message + "'";
        } else {
          errorInfo = " with a message matching " + message + ", but got '" + err.message + "'";
        }
      }
    }

    this.assert(
        ok
      , 'expected an exception to be thrown' + errorInfo
      , 'expected no exception to be thrown, got "' + err.message + '"');

    return this;
  }
};
Assertion.prototype.instanceOf = Assertion.prototype.instanceof;
/**
 * Aliases.
 */

(function alias(name, as){
  Assertion.prototype[as] = Assertion.prototype[name];
  return alias;
})
('length', 'lengthOf')
('keys', 'key')
('ownProperty', 'haveOwnProperty')
('above', 'greaterThan')
('below', 'lessThan');


});

require.define("http",function(require,module,exports,__dirname,__filename,process,global){module.exports = require("http-browserify")
});

require.define("/node_modules/http-browserify/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"index.js","browserify":"index.js"}
});

require.define("/node_modules/http-browserify/index.js",function(require,module,exports,__dirname,__filename,process,global){var http = module.exports;
var EventEmitter = require('events').EventEmitter;
var Request = require('./lib/request');

http.request = function (params, cb) {
    if (!params) params = {};
    if (!params.host) params.host = window.location.host.split(':')[0];
    if (!params.port) params.port = window.location.port;
    
    var req = new Request(new xhrHttp, params);
    if (cb) req.on('response', cb);
    return req;
};

http.get = function (params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
};

http.Agent = function () {};
http.Agent.defaultMaxSockets = 4;

var xhrHttp = (function () {
    if (typeof window === 'undefined') {
        throw new Error('no window object present');
    }
    else if (window.XMLHttpRequest) {
        return window.XMLHttpRequest;
    }
    else if (window.ActiveXObject) {
        var axs = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Microsoft.XMLHTTP'
        ];
        for (var i = 0; i < axs.length; i++) {
            try {
                var ax = new(window.ActiveXObject)(axs[i]);
                return function () {
                    if (ax) {
                        var ax_ = ax;
                        ax = null;
                        return ax_;
                    }
                    else {
                        return new(window.ActiveXObject)(axs[i]);
                    }
                };
            }
            catch (e) {}
        }
        throw new Error('ajax not supported in this browser')
    }
    else {
        throw new Error('ajax not supported in this browser');
    }
})();

});

require.define("/node_modules/http-browserify/lib/request.js",function(require,module,exports,__dirname,__filename,process,global){var Stream = require('stream');
var Response = require('./response');
var concatStream = require('concat-stream')

var Request = module.exports = function (xhr, params) {
    var self = this;
    self.writable = true;
    self.xhr = xhr;
    self.body = concatStream()
    
    var uri = params.host + ':' + params.port + (params.path || '/');
    
    xhr.open(
        params.method || 'GET',
        (params.scheme || 'http') + '://' + uri,
        true
    );
    
    if (params.headers) {
        var keys = objectKeys(params.headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!self.isSafeRequestHeader(key)) return;
            var value = params.headers[key];
            if (isArray(value)) {
                for (var j = 0; j < value.length; j++) {
                    xhr.setRequestHeader(key, value[j]);
                }
            }
            else xhr.setRequestHeader(key, value)
        }
    }
    
    var res = new Response;
    res.on('close', function () {
        self.emit('close');
    });
    
    res.on('ready', function () {
        self.emit('response', res);
    });
    
    xhr.onreadystatechange = function () {
        res.handle(xhr);
    };
};

Request.prototype = new Stream;

Request.prototype.setHeader = function (key, value) {
    if (isArray(value)) {
        for (var i = 0; i < value.length; i++) {
            this.xhr.setRequestHeader(key, value[i]);
        }
    }
    else {
        this.xhr.setRequestHeader(key, value);
    }
};

Request.prototype.write = function (s) {
    this.body.write(s);
};

Request.prototype.destroy = function (s) {
    this.xhr.abort();
    this.emit('close');
};

Request.prototype.end = function (s) {
    if (s !== undefined) this.body.write(s);
    this.body.end()
    this.xhr.send(this.body.getBody());
};

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
Request.unsafeHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "content-transfer-encoding",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
];

Request.prototype.isSafeRequestHeader = function (headerName) {
    if (!headerName) return false;
    return indexOf(Request.unsafeHeaders, headerName.toLowerCase()) === -1;
};

var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var indexOf = function (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (xs[i] === x) return i;
    }
    return -1;
};

});

require.define("stream",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');
var util = require('util');

function Stream() {
  events.EventEmitter.call(this);
}
util.inherits(Stream, events.EventEmitter);
module.exports = Stream;
// Backwards-compat with node 0.4.x
Stream.Stream = Stream;

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once, and
  // only when all sources have ended.
  if (!dest._isStdio && (!options || options.end !== false)) {
    dest._pipeCount = dest._pipeCount || 0;
    dest._pipeCount++;

    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest._pipeCount--;

    // remove the listeners
    cleanup();

    if (dest._pipeCount > 0) {
      // waiting for other incoming streams to end.
      return;
    }

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest._pipeCount--;

    // remove the listeners
    cleanup();

    if (dest._pipeCount > 0) {
      // waiting for other incoming streams to end.
      return;
    }

    dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (this.listeners('error').length === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('end', cleanup);
    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('end', cleanup);
  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

});

require.define("/node_modules/http-browserify/lib/response.js",function(require,module,exports,__dirname,__filename,process,global){var Stream = require('stream');

var Response = module.exports = function (res) {
    this.offset = 0;
    this.readable = true;
};

Response.prototype = new Stream;

var capable = {
    streaming : true,
    status2 : true
};

function parseHeaders (res) {
    var lines = res.getAllResponseHeaders().split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') continue;
        
        var m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
            var key = m[1].toLowerCase(), value = m[2];
            
            if (headers[key] !== undefined) {
            
                if (isArray(headers[key])) {
                    headers[key].push(value);
                }
                else {
                    headers[key] = [ headers[key], value ];
                }
            }
            else {
                headers[key] = value;
            }
        }
        else {
            headers[line] = true;
        }
    }
    return headers;
}

Response.prototype.getResponse = function (xhr) {
    var respType = String(xhr.responseType).toLowerCase();
    if (respType === 'blob') return xhr.responseBlob;
    if (respType === 'arraybuffer') return xhr.response;
    return xhr.responseText;
}

Response.prototype.getHeader = function (key) {
    return this.headers[key.toLowerCase()];
};

Response.prototype.handle = function (res) {
    if (res.readyState === 2 && capable.status2) {
        try {
            this.statusCode = res.status;
            this.headers = parseHeaders(res);
        }
        catch (err) {
            capable.status2 = false;
        }
        
        if (capable.status2) {
            this.emit('ready');
        }
    }
    else if (capable.streaming && res.readyState === 3) {
        try {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
                this.emit('ready');
            }
        }
        catch (err) {}
        
        try {
            this._emitData(res);
        }
        catch (err) {
            capable.streaming = false;
        }
    }
    else if (res.readyState === 4) {
        if (!this.statusCode) {
            this.statusCode = res.status;
            this.emit('ready');
        }
        this._emitData(res);
        
        if (res.error) {
            this.emit('error', this.getResponse(res));
        }
        else this.emit('end');
        
        this.emit('close');
    }
};

Response.prototype._emitData = function (res) {
    var respBody = this.getResponse(res);
    if (respBody.toString().match(/ArrayBuffer/)) {
        this.emit('data', new Uint8Array(respBody, this.offset));
        this.offset = respBody.byteLength;
        return;
    }
    if (respBody.length > this.offset) {
        this.emit('data', respBody.slice(this.offset));
        this.offset = respBody.length;
    }
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

});

require.define("/node_modules/http-browserify/node_modules/concat-stream/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {}
});

require.define("/node_modules/http-browserify/node_modules/concat-stream/index.js",function(require,module,exports,__dirname,__filename,process,global){var stream = require('stream')
var util = require('util')

function ConcatStream(cb) {
  stream.Stream.call(this)
  this.writable = true
  if (cb) this.cb = cb
  this.body = []
  if (this.cb) this.on('error', cb)
}

util.inherits(ConcatStream, stream.Stream)

ConcatStream.prototype.write = function(chunk) {
  this.body.push(chunk)
}

ConcatStream.prototype.arrayConcat = function(arrs) {
  if (arrs.length === 0) return []
  if (arrs.length === 1) return arrs[0]
  return arrs.reduce(function (a, b) { return a.concat(b) })
}

ConcatStream.prototype.isArray = function(arr) {
  var isArray = Array.isArray(arr)
  var isTypedArray = arr.toString().match(/Array/)
  return isArray || isTypedArray
}

ConcatStream.prototype.getBody = function () {
  if (this.body.length === 0) return
  if (typeof(this.body[0]) === "string") return this.body.join('')
  if (this.isArray(this.body[0])) return this.arrayConcat(this.body)
  if (typeof(Buffer) !== "undefined" && Buffer.isBuffer(this.body[0])) {
    return Buffer.concat(this.body)
  }
  return this.body
}

ConcatStream.prototype.end = function() {
  if (this.cb) this.cb(false, this.getBody())
}

module.exports = function(cb) {
  return new ConcatStream(cb)
}

module.exports.ConcatStream = ConcatStream

});

require.define("assert",function(require,module,exports,__dirname,__filename,process,global){// UTILITY
var util = require('util');
var Buffer = require("buffer").Buffer;
var pSlice = Array.prototype.slice;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.message = options.message;
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
};
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (value === undefined) {
    return '' + value;
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (typeof value === 'function' || value instanceof RegExp) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (typeof s == 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

assert.AssertionError.prototype.toString = function() {
  if (this.message) {
    return [this.name + ':', this.message].join(' ');
  } else {
    return [
      this.name + ':',
      truncate(JSON.stringify(this.actual, replacer), 128),
      this.operator,
      truncate(JSON.stringify(this.expected, replacer), 128)
    ].join(' ');
  }
};

// assert.AssertionError instanceof Error

assert.AssertionError.__proto__ = Error.prototype;

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!!!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = Object.keys(a),
        kb = Object.keys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (expected instanceof RegExp) {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail('Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail('Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

});

require.define("buffer",function(require,module,exports,__dirname,__filename,process,global){module.exports = require("buffer-browserify")
});

require.define("/node_modules/buffer-browserify/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"index.js","browserify":"index.js"}
});

require.define("/node_modules/buffer-browserify/index.js",function(require,module,exports,__dirname,__filename,process,global){function SlowBuffer (size) {
    this.length = size;
};

var assert = require('assert');

exports.INSPECT_MAX_BYTES = 50;


function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i));
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16));
    }

  return byteArray;
}

function asciiToBytes(str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++ )
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push( str.charCodeAt(i) & 0xFF );

  return byteArray;
}

function base64ToBytes(str) {
  return require("base64-js").toByteArray(str);
}

SlowBuffer.byteLength = function (str, encoding) {
  switch (encoding || "utf8") {
    case 'hex':
      return str.length / 2;

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length;

    case 'ascii':
      return str.length;

    case 'base64':
      return base64ToBytes(str).length;

    default:
      throw new Error('Unknown encoding');
  }
};

function blitBuffer(src, dst, offset, length) {
  var pos, i = 0;
  while (i < length) {
    if ((i+offset >= dst.length) || (i >= src.length))
      break;

    dst[i + offset] = src[i];
    i++;
  }
  return i;
}

SlowBuffer.prototype.utf8Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(utf8ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.asciiWrite = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten =  blitBuffer(asciiToBytes(string), this, offset, length);
};

SlowBuffer.prototype.base64Write = function (string, offset, length) {
  var bytes, pos;
  return SlowBuffer._charsWritten = blitBuffer(base64ToBytes(string), this, offset, length);
};

SlowBuffer.prototype.base64Slice = function (start, end) {
  var bytes = Array.prototype.slice.apply(this, arguments)
  return require("base64-js").fromByteArray(bytes);
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xFFFD); // UTF 8 invalid char
  }
}

SlowBuffer.prototype.utf8Slice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else
      tmp += "%" + bytes[i].toString(16);

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

SlowBuffer.prototype.asciiSlice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var ret = "";
  for (var i = 0; i < bytes.length; i++)
    ret += String.fromCharCode(bytes[i]);
  return ret;
}

SlowBuffer.prototype.inspect = function() {
  var out = [],
      len = this.length;
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }
  return '<SlowBuffer ' + out.join(' ') + '>';
};


SlowBuffer.prototype.hexSlice = function(start, end) {
  var len = this.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; i++) {
    out += toHex(this[i]);
  }
  return out;
};


SlowBuffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();
  start = +start || 0;
  if (typeof end == 'undefined') end = this.length;

  // Fastpath empty strings
  if (+end == start) {
    return '';
  }

  switch (encoding) {
    case 'hex':
      return this.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.utf8Slice(start, end);

    case 'ascii':
      return this.asciiSlice(start, end);

    case 'binary':
      return this.binarySlice(start, end);

    case 'base64':
      return this.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


SlowBuffer.prototype.hexWrite = function(string, offset, length) {
  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2) {
    throw new Error('Invalid hex string');
  }
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(byte)) throw new Error('Invalid hex string');
    this[offset + i] = byte;
  }
  SlowBuffer._charsWritten = i * 2;
  return i;
};


SlowBuffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  switch (encoding) {
    case 'hex':
      return this.hexWrite(string, offset, length);

    case 'utf8':
    case 'utf-8':
      return this.utf8Write(string, offset, length);

    case 'ascii':
      return this.asciiWrite(string, offset, length);

    case 'binary':
      return this.binaryWrite(string, offset, length);

    case 'base64':
      return this.base64Write(string, offset, length);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Write(string, offset, length);

    default:
      throw new Error('Unknown encoding');
  }
};


// slice(start, end)
SlowBuffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;

  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  return new Buffer(this, end - start, +start);
};

SlowBuffer.prototype.copy = function(target, targetstart, sourcestart, sourceend) {
  var temp = [];
  for (var i=sourcestart; i<sourceend; i++) {
    assert.ok(typeof this[i] !== 'undefined', "copying undefined buffer bytes!");
    temp.push(this[i]);
  }

  for (var i=targetstart; i<targetstart+temp.length; i++) {
    target[i] = temp[i-targetstart];
  }
};

function coerce(length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length);
  return length < 0 ? 0 : length;
}


// Buffer

function Buffer(subject, encoding, offset) {
  if (!(this instanceof Buffer)) {
    return new Buffer(subject, encoding, offset);
  }

  var type;

  // Are we slicing?
  if (typeof offset === 'number') {
    this.length = coerce(encoding);
    this.parent = subject;
    this.offset = offset;
  } else {
    // Find the length
    switch (type = typeof subject) {
      case 'number':
        this.length = coerce(subject);
        break;

      case 'string':
        this.length = Buffer.byteLength(subject, encoding);
        break;

      case 'object': // Assume object is an array
        this.length = coerce(subject.length);
        break;

      default:
        throw new Error('First argument needs to be a number, ' +
                        'array or string.');
    }

    if (this.length > Buffer.poolSize) {
      // Big buffer, just alloc one.
      this.parent = new SlowBuffer(this.length);
      this.offset = 0;

    } else {
      // Small buffer.
      if (!pool || pool.length - pool.used < this.length) allocPool();
      this.parent = pool;
      this.offset = pool.used;
      pool.used += this.length;
    }

    // Treat array-ish objects as a byte array.
    if (isArrayIsh(subject)) {
      for (var i = 0; i < this.length; i++) {
        this.parent[i + this.offset] = subject[i];
      }
    } else if (type == 'string') {
      // We are a string
      this.length = this.write(subject, 0, encoding);
    }
  }

}

function isArrayIsh(subject) {
  return Array.isArray(subject) || Buffer.isBuffer(subject) ||
         subject && typeof subject === 'object' &&
         typeof subject.length === 'number';
}

exports.SlowBuffer = SlowBuffer;
exports.Buffer = Buffer;

Buffer.poolSize = 8 * 1024;
var pool;

function allocPool() {
  pool = new SlowBuffer(Buffer.poolSize);
  pool.used = 0;
}


// Static methods
Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer || b instanceof SlowBuffer;
};

Buffer.concat = function (list, totalLength) {
  if (!Array.isArray(list)) {
    throw new Error("Usage: Buffer.concat(list, [totalLength])\n \
      list should be an Array.");
  }

  if (list.length === 0) {
    return new Buffer(0);
  } else if (list.length === 1) {
    return list[0];
  }

  if (typeof totalLength !== 'number') {
    totalLength = 0;
    for (var i = 0; i < list.length; i++) {
      var buf = list[i];
      totalLength += buf.length;
    }
  }

  var buffer = new Buffer(totalLength);
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

// Inspect
Buffer.prototype.inspect = function inspect() {
  var out = [],
      len = this.length;

  for (var i = 0; i < len; i++) {
    out[i] = toHex(this.parent[i + this.offset]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }

  return '<Buffer ' + out.join(' ') + '>';
};


Buffer.prototype.get = function get(i) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i];
};


Buffer.prototype.set = function set(i, v) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this.parent[this.offset + i] = v;
};


// write(string, offset = 0, length = buffer.length-offset, encoding = 'utf8')
Buffer.prototype.write = function(string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  var ret;
  switch (encoding) {
    case 'hex':
      ret = this.parent.hexWrite(string, this.offset + offset, length);
      break;

    case 'utf8':
    case 'utf-8':
      ret = this.parent.utf8Write(string, this.offset + offset, length);
      break;

    case 'ascii':
      ret = this.parent.asciiWrite(string, this.offset + offset, length);
      break;

    case 'binary':
      ret = this.parent.binaryWrite(string, this.offset + offset, length);
      break;

    case 'base64':
      // Warning: maxLength not taken into account in base64Write
      ret = this.parent.base64Write(string, this.offset + offset, length);
      break;

    case 'ucs2':
    case 'ucs-2':
      ret = this.parent.ucs2Write(string, this.offset + offset, length);
      break;

    default:
      throw new Error('Unknown encoding');
  }

  Buffer._charsWritten = SlowBuffer._charsWritten;

  return ret;
};


// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();

  if (typeof start == 'undefined' || start < 0) {
    start = 0;
  } else if (start > this.length) {
    start = this.length;
  }

  if (typeof end == 'undefined' || end > this.length) {
    end = this.length;
  } else if (end < 0) {
    end = 0;
  }

  start = start + this.offset;
  end = end + this.offset;

  switch (encoding) {
    case 'hex':
      return this.parent.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.parent.utf8Slice(start, end);

    case 'ascii':
      return this.parent.asciiSlice(start, end);

    case 'binary':
      return this.parent.binarySlice(start, end);

    case 'base64':
      return this.parent.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.parent.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


// byteLength
Buffer.byteLength = SlowBuffer.byteLength;


// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill(value, start, end) {
  value || (value = 0);
  start || (start = 0);
  end || (end = this.length);

  if (typeof value === 'string') {
    value = value.charCodeAt(0);
  }
  if (!(typeof value === 'number') || isNaN(value)) {
    throw new Error('value is not a number');
  }

  if (end < start) throw new Error('end < start');

  // Fill 0 bytes; we're done
  if (end === start) return 0;
  if (this.length == 0) return 0;

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds');
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds');
  }

  return this.parent.fill(value,
                          start + this.offset,
                          end + this.offset);
};


// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function(target, target_start, start, end) {
  var source = this;
  start || (start = 0);
  end || (end = this.length);
  target_start || (target_start = 0);

  if (end < start) throw new Error('sourceEnd < sourceStart');

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length == 0 || source.length == 0) return 0;

  if (target_start < 0 || target_start >= target.length) {
    throw new Error('targetStart out of bounds');
  }

  if (start < 0 || start >= source.length) {
    throw new Error('sourceStart out of bounds');
  }

  if (end < 0 || end > source.length) {
    throw new Error('sourceEnd out of bounds');
  }

  // Are we oob?
  if (end > this.length) {
    end = this.length;
  }

  if (target.length - target_start < end - start) {
    end = target.length - target_start + start;
  }

  return this.parent.copy(target.parent,
                          target_start + target.offset,
                          start + this.offset,
                          end + this.offset);
};


// slice(start, end)
Buffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;
  if (end > this.length) throw new Error('oob');
  if (start > end) throw new Error('oob');

  return new Buffer(this.parent, end - start, +start + this.offset);
};


// Legacy methods for backwards compatibility.

Buffer.prototype.utf8Slice = function(start, end) {
  return this.toString('utf8', start, end);
};

Buffer.prototype.binarySlice = function(start, end) {
  return this.toString('binary', start, end);
};

Buffer.prototype.asciiSlice = function(start, end) {
  return this.toString('ascii', start, end);
};

Buffer.prototype.utf8Write = function(string, offset) {
  return this.write(string, offset, 'utf8');
};

Buffer.prototype.binaryWrite = function(string, offset) {
  return this.write(string, offset, 'binary');
};

Buffer.prototype.asciiWrite = function(string, offset) {
  return this.write(string, offset, 'ascii');
};

Buffer.prototype.readUInt8 = function(offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  return buffer.parent[buffer.offset + offset];
};

function readUInt16(buffer, offset, isBigEndian, noAssert) {
  var val = 0;


  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (isBigEndian) {
    val = buffer.parent[buffer.offset + offset] << 8;
    val |= buffer.parent[buffer.offset + offset + 1];
  } else {
    val = buffer.parent[buffer.offset + offset];
    val |= buffer.parent[buffer.offset + offset + 1] << 8;
  }

  return val;
}

Buffer.prototype.readUInt16LE = function(offset, noAssert) {
  return readUInt16(this, offset, false, noAssert);
};

Buffer.prototype.readUInt16BE = function(offset, noAssert) {
  return readUInt16(this, offset, true, noAssert);
};

function readUInt32(buffer, offset, isBigEndian, noAssert) {
  var val = 0;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (isBigEndian) {
    val = buffer.parent[buffer.offset + offset + 1] << 16;
    val |= buffer.parent[buffer.offset + offset + 2] << 8;
    val |= buffer.parent[buffer.offset + offset + 3];
    val = val + (buffer.parent[buffer.offset + offset] << 24 >>> 0);
  } else {
    val = buffer.parent[buffer.offset + offset + 2] << 16;
    val |= buffer.parent[buffer.offset + offset + 1] << 8;
    val |= buffer.parent[buffer.offset + offset];
    val = val + (buffer.parent[buffer.offset + offset + 3] << 24 >>> 0);
  }

  return val;
}

Buffer.prototype.readUInt32LE = function(offset, noAssert) {
  return readUInt32(this, offset, false, noAssert);
};

Buffer.prototype.readUInt32BE = function(offset, noAssert) {
  return readUInt32(this, offset, true, noAssert);
};


/*
 * Signed integer types, yay team! A reminder on how two's complement actually
 * works. The first bit is the signed bit, i.e. tells us whether or not the
 * number should be positive or negative. If the two's complement value is
 * positive, then we're done, as it's equivalent to the unsigned representation.
 *
 * Now if the number is positive, you're pretty much done, you can just leverage
 * the unsigned translations and return those. Unfortunately, negative numbers
 * aren't quite that straightforward.
 *
 * At first glance, one might be inclined to use the traditional formula to
 * translate binary numbers between the positive and negative values in two's
 * complement. (Though it doesn't quite work for the most negative value)
 * Mainly:
 *  - invert all the bits
 *  - add one to the result
 *
 * Of course, this doesn't quite work in Javascript. Take for example the value
 * of -128. This could be represented in 16 bits (big-endian) as 0xff80. But of
 * course, Javascript will do the following:
 *
 * > ~0xff80
 * -65409
 *
 * Whoh there, Javascript, that's not quite right. But wait, according to
 * Javascript that's perfectly correct. When Javascript ends up seeing the
 * constant 0xff80, it has no notion that it is actually a signed number. It
 * assumes that we've input the unsigned value 0xff80. Thus, when it does the
 * binary negation, it casts it into a signed value, (positive 0xff80). Then
 * when you perform binary negation on that, it turns it into a negative number.
 *
 * Instead, we're going to have to use the following general formula, that works
 * in a rather Javascript friendly way. I'm glad we don't support this kind of
 * weird numbering scheme in the kernel.
 *
 * (BIT-MAX - (unsigned)val + 1) * -1
 *
 * The astute observer, may think that this doesn't make sense for 8-bit numbers
 * (really it isn't necessary for them). However, when you get 16-bit numbers,
 * you do. Let's go back to our prior example and see how this will look:
 *
 * (0xffff - 0xff80 + 1) * -1
 * (0x007f + 1) * -1
 * (0x0080) * -1
 */
Buffer.prototype.readInt8 = function(offset, noAssert) {
  var buffer = this;
  var neg;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  neg = buffer.parent[buffer.offset + offset] & 0x80;
  if (!neg) {
    return (buffer.parent[buffer.offset + offset]);
  }

  return ((0xff - buffer.parent[buffer.offset + offset] + 1) * -1);
};

function readInt16(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt16(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x8000;
  if (!neg) {
    return val;
  }

  return (0xffff - val + 1) * -1;
}

Buffer.prototype.readInt16LE = function(offset, noAssert) {
  return readInt16(this, offset, false, noAssert);
};

Buffer.prototype.readInt16BE = function(offset, noAssert) {
  return readInt16(this, offset, true, noAssert);
};

function readInt32(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt32(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x80000000;
  if (!neg) {
    return (val);
  }

  return (0xffffffff - val + 1) * -1;
}

Buffer.prototype.readInt32LE = function(offset, noAssert) {
  return readInt32(this, offset, false, noAssert);
};

Buffer.prototype.readInt32BE = function(offset, noAssert) {
  return readInt32(this, offset, true, noAssert);
};

function readFloat(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.readFloatLE = function(offset, noAssert) {
  return readFloat(this, offset, false, noAssert);
};

Buffer.prototype.readFloatBE = function(offset, noAssert) {
  return readFloat(this, offset, true, noAssert);
};

function readDouble(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 7 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.readDoubleLE = function(offset, noAssert) {
  return readDouble(this, offset, false, noAssert);
};

Buffer.prototype.readDoubleBE = function(offset, noAssert) {
  return readDouble(this, offset, true, noAssert);
};


/*
 * We have to make sure that the value is a valid integer. This means that it is
 * non-negative. It has no fractional component and that it does not exceed the
 * maximum allowed value.
 *
 *      value           The number to check for validity
 *
 *      max             The maximum value
 */
function verifuint(value, max) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value >= 0,
      'specified a negative value for writing an unsigned value');

  assert.ok(value <= max, 'value is larger than maximum value for type');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

Buffer.prototype.writeUInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xff);
  }

  buffer.parent[buffer.offset + offset] = value;
};

function writeUInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffff);
  }

  if (isBigEndian) {
    buffer.parent[buffer.offset + offset] = (value & 0xff00) >>> 8;
    buffer.parent[buffer.offset + offset + 1] = value & 0x00ff;
  } else {
    buffer.parent[buffer.offset + offset + 1] = (value & 0xff00) >>> 8;
    buffer.parent[buffer.offset + offset] = value & 0x00ff;
  }
}

Buffer.prototype.writeUInt16LE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt16BE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, true, noAssert);
};

function writeUInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffffffff);
  }

  if (isBigEndian) {
    buffer.parent[buffer.offset + offset] = (value >>> 24) & 0xff;
    buffer.parent[buffer.offset + offset + 1] = (value >>> 16) & 0xff;
    buffer.parent[buffer.offset + offset + 2] = (value >>> 8) & 0xff;
    buffer.parent[buffer.offset + offset + 3] = value & 0xff;
  } else {
    buffer.parent[buffer.offset + offset + 3] = (value >>> 24) & 0xff;
    buffer.parent[buffer.offset + offset + 2] = (value >>> 16) & 0xff;
    buffer.parent[buffer.offset + offset + 1] = (value >>> 8) & 0xff;
    buffer.parent[buffer.offset + offset] = value & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt32BE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, true, noAssert);
};


/*
 * We now move onto our friends in the signed number category. Unlike unsigned
 * numbers, we're going to have to worry a bit more about how we put values into
 * arrays. Since we are only worrying about signed 32-bit values, we're in
 * slightly better shape. Unfortunately, we really can't do our favorite binary
 * & in this system. It really seems to do the wrong thing. For example:
 *
 * > -32 & 0xff
 * 224
 *
 * What's happening above is really: 0xe0 & 0xff = 0xe0. However, the results of
 * this aren't treated as a signed number. Ultimately a bad thing.
 *
 * What we're going to want to do is basically create the unsigned equivalent of
 * our representation and pass that off to the wuint* functions. To do that
 * we're going to do the following:
 *
 *  - if the value is positive
 *      we can pass it directly off to the equivalent wuint
 *  - if the value is negative
 *      we do the following computation:
 *         mb + val + 1, where
 *         mb   is the maximum unsigned value in that byte size
 *         val  is the Javascript negative integer
 *
 *
 * As a concrete value, take -128. In signed 16 bits this would be 0xff80. If
 * you do out the computations:
 *
 * 0xffff - 128 + 1
 * 0xffff - 127
 * 0xff80
 *
 * You can then encode this value as the signed version. This is really rather
 * hacky, but it should work and get the job done which is our goal here.
 */

/*
 * A series of checks to make sure we actually have a signed 32-bit number
 */
function verifsint(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

function verifIEEE754(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');
}

Buffer.prototype.writeInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7f, -0x80);
  }

  if (value >= 0) {
    buffer.writeUInt8(value, offset, noAssert);
  } else {
    buffer.writeUInt8(0xff + value + 1, offset, noAssert);
  }
};

function writeInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fff, -0x8000);
  }

  if (value >= 0) {
    writeUInt16(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt16(buffer, 0xffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt16LE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt16BE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, true, noAssert);
};

function writeInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fffffff, -0x80000000);
  }

  if (value >= 0) {
    writeUInt32(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt32(buffer, 0xffffffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt32LE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt32BE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, true, noAssert);
};

function writeFloat(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.writeFloatLE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, false, noAssert);
};

Buffer.prototype.writeFloatBE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, true, noAssert);
};

function writeDouble(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 7 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.writeDoubleLE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, false, noAssert);
};

Buffer.prototype.writeDoubleBE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, true, noAssert);
};

SlowBuffer.prototype.readUInt8 = Buffer.prototype.readUInt8;
SlowBuffer.prototype.readUInt16LE = Buffer.prototype.readUInt16LE;
SlowBuffer.prototype.readUInt16BE = Buffer.prototype.readUInt16BE;
SlowBuffer.prototype.readUInt32LE = Buffer.prototype.readUInt32LE;
SlowBuffer.prototype.readUInt32BE = Buffer.prototype.readUInt32BE;
SlowBuffer.prototype.readInt8 = Buffer.prototype.readInt8;
SlowBuffer.prototype.readInt16LE = Buffer.prototype.readInt16LE;
SlowBuffer.prototype.readInt16BE = Buffer.prototype.readInt16BE;
SlowBuffer.prototype.readInt32LE = Buffer.prototype.readInt32LE;
SlowBuffer.prototype.readInt32BE = Buffer.prototype.readInt32BE;
SlowBuffer.prototype.readFloatLE = Buffer.prototype.readFloatLE;
SlowBuffer.prototype.readFloatBE = Buffer.prototype.readFloatBE;
SlowBuffer.prototype.readDoubleLE = Buffer.prototype.readDoubleLE;
SlowBuffer.prototype.readDoubleBE = Buffer.prototype.readDoubleBE;
SlowBuffer.prototype.writeUInt8 = Buffer.prototype.writeUInt8;
SlowBuffer.prototype.writeUInt16LE = Buffer.prototype.writeUInt16LE;
SlowBuffer.prototype.writeUInt16BE = Buffer.prototype.writeUInt16BE;
SlowBuffer.prototype.writeUInt32LE = Buffer.prototype.writeUInt32LE;
SlowBuffer.prototype.writeUInt32BE = Buffer.prototype.writeUInt32BE;
SlowBuffer.prototype.writeInt8 = Buffer.prototype.writeInt8;
SlowBuffer.prototype.writeInt16LE = Buffer.prototype.writeInt16LE;
SlowBuffer.prototype.writeInt16BE = Buffer.prototype.writeInt16BE;
SlowBuffer.prototype.writeInt32LE = Buffer.prototype.writeInt32LE;
SlowBuffer.prototype.writeInt32BE = Buffer.prototype.writeInt32BE;
SlowBuffer.prototype.writeFloatLE = Buffer.prototype.writeFloatLE;
SlowBuffer.prototype.writeFloatBE = Buffer.prototype.writeFloatBE;
SlowBuffer.prototype.writeDoubleLE = Buffer.prototype.writeDoubleLE;
SlowBuffer.prototype.writeDoubleBE = Buffer.prototype.writeDoubleBE;

});

require.define("/node_modules/buffer-browserify/node_modules/base64-js/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"lib/b64.js"}
});

require.define("/node_modules/buffer-browserify/node_modules/base64-js/lib/b64.js",function(require,module,exports,__dirname,__filename,process,global){(function (exports) {
	'use strict';

	var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	function b64ToByteArray(b64) {
		var i, j, l, tmp, placeHolders, arr;
	
		if (b64.length % 4 > 0) {
			throw 'Invalid string. Length must be a multiple of 4';
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		placeHolders = b64.indexOf('=');
		placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;

		// base64 is 4/3 + up to two characters of the original data
		arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length;

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
			arr.push((tmp & 0xFF0000) >> 16);
			arr.push((tmp & 0xFF00) >> 8);
			arr.push(tmp & 0xFF);
		}

		if (placeHolders === 2) {
			tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
			arr.push(tmp & 0xFF);
		} else if (placeHolders === 1) {
			tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
			arr.push((tmp >> 8) & 0xFF);
			arr.push(tmp & 0xFF);
		}

		return arr;
	}

	function uint8ToBase64(uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length;

		function tripletToBase64 (num) {
			return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
		};

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
			output += tripletToBase64(temp);
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1];
				output += lookup[temp >> 2];
				output += lookup[(temp << 4) & 0x3F];
				output += '==';
				break;
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
				output += lookup[temp >> 10];
				output += lookup[(temp >> 4) & 0x3F];
				output += lookup[(temp << 2) & 0x3F];
				output += '=';
				break;
		}

		return output;
	}

	module.exports.toByteArray = b64ToByteArray;
	module.exports.fromByteArray = uint8ToBase64;
}());

});

require.define("/node_modules/buffer-browserify/buffer_ieee754.js",function(require,module,exports,__dirname,__filename,process,global){exports.readIEEE754 = function(buffer, offset, isBE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isBE ? 0 : (nBytes - 1),
      d = isBE ? 1 : -1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.writeIEEE754 = function(buffer, value, offset, isBE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isBE ? (nBytes - 1) : 0,
      d = isBE ? -1 : 1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

});

require.define("/node_modules/should/lib/eql.js",function(require,module,exports,__dirname,__filename,process,global){
// Taken from node's assert module, because it sucks
// and exposes next to nothing useful.

module.exports = _deepEqual;

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == "object",
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual === expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical "prototype" property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull (value) {
  return value === null || value === undefined;
}

function isArguments (object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv (a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical "prototype" property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try{
    var ka = Object.keys(a),
      kb = Object.keys(b),
      key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key] ))
       return false;
  }
  return true;
}

});

require.define("/test/assertions.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var assert;
    assert = require("assert");
    global.shouldContainFields = require("./containsFields").containsFields;
    global.shouldEqual = function(x, y) {
        var self = this;
        return assert.equal(x, y);
    };
    global.shouldBeTruthy = function(x) {
        var self = this;
        return assert.ok(x);
    };
    global.shouldBeFalsy = function(x) {
        var self = this;
        return assert.ok(!x);
    };
}).call(this);
});

require.define("/test/containsFields.js",function(require,module,exports,__dirname,__filename,process,global){var util = require('util');
var assert = require('assert');
var _ = require('underscore');

var inspect = function (o) {
  return util.inspect(o, false, 10, true);
};

var containsFields = exports.containsFields = function (actual, expected, key, originalActual) {
  var index = function (i) {
    return key + '[' + i + ']';
  };

  var field = function (f) {
    if (key) {
      return key + '.' + f;
    } else {
      return f;
    }
  };

  var originalActual = (originalActual || actual);
  var message = function () {
    var inspectedOriginalActual = inspect(originalActual);
    var inspectedActual = inspect(actual);
    var inspectedExpected = inspect(expected);
    return 'in ' + inspectedOriginalActual + ', ' + key + ' ' + inspectedActual + ' should be equal to ' + inspectedExpected;
  };

  if (_.isArray(expected)) {
    assert.ok(actual, message());

    containsFields(actual.length, expected.length, field('length'), originalActual);
    for (var n = 0; n < expected.length; n++) {
      containsFields(actual[n], expected[n], index(n), originalActual);
    }
  } else if (_.isObject(expected)) {
    assert.ok(actual, message());

    for (var n in expected) {
      if (expected.hasOwnProperty(n)) {
        containsFields(actual[n], expected[n], field(n), originalActual);
      }
    }
  } else {
    assert.deepEqual(actual, expected, message());
  }
};

});

require.define("/test/scriptAssertions.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var assert, compiler, util, _, chomp;
    assert = require("assert");
    compiler = require("../lib/parser/compiler");
    util = require("util");
    _ = require("underscore");
    chomp = function(s) {
        return s.toString().replace(/\n$/, "");
    };
    exports.evaluateScript = function(script) {
        var self = this;
        var printedItems, print;
        printedItems = [];
        print = function(arg) {
            return printedItems.push(arg);
        };
        compiler.evaluate(script, {
            definitions: {
                print: print
            }
        });
        return _.map(printedItems, function(item) {
            return util.inspect(item);
        }).join("\n");
    };
    exports.shouldOutput = function(script, expectedOutput) {
        var self = this;
        return assert.equal(chomp(exports.evaluateScript(script)), chomp(expectedOutput));
    };
    exports.evaluateAsyncScript = function(script, done) {
        var self = this;
        var printedItems, print, async, returnPrintedOutput;
        printedItems = [];
        print = function(arg) {
            return printedItems.push(arg);
        };
        async = function(callback) {
            return process.nextTick(callback);
        };
        returnPrintedOutput = function(error) {
            return done(error, _.map(printedItems, function(item) {
                return util.inspect(item);
            }).join("\n"));
        };
        return compiler.evaluate(script, {
            definitions: {
                print: print,
                done: returnPrintedOutput,
                async: async
            }
        });
    };
    exports.asyncShouldOutput = function(script, expectedOutput, done) {
        var self = this;
        return exports.evaluateAsyncScript(script, function(error, result) {
            if (error) {
                return done(error);
            } else {
                try {
                    assert.equal(chomp(result), chomp(expectedOutput));
                    return done();
                } catch (ex) {
                    return done(ex);
                }
            }
        });
    };
    exports.shouldThrow = function(script, expectedError) {
        var self = this;
        var failed;
        failed = false;
        try {
            exports.evaluateScript(script);
            failed = true;
        } catch (ex) {
            assert.equal(ex.toString(), expectedError);
        }
        if (failed) {
            return assert.fail("expected " + expectedError);
        }
    };
}).call(this);
});

require.define("/lib/parser/compiler.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var ms, createParser, uglify, createTerms, beautify, generateCode, sourceLocationPrinter;
    ms = require("../../lib/memorystream");
    createParser = require("./parser").createParser;
    uglify = require("uglify-js");
    createTerms = function() {
        return require("./codeGenerator").codeGenerator();
    };
    beautify = function(code) {
        var ast;
        ast = uglify.parser.parse(code);
        return uglify.uglify.gen_code(ast, {
            beautify: true
        });
    };
    generateCode = function(term) {
        var memoryStream;
        memoryStream = new ms.MemoryStream;
        term.generateJavaScriptModule(memoryStream);
        return memoryStream.toString();
    };
    exports.compile = function(pogo, gen1_options) {
        var self = this;
        var filename, inScope, ugly, global, returnResult, async, terms;
        filename = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "filename") && gen1_options.filename !== void 0 ? gen1_options.filename : void 0;
        inScope = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "inScope") && gen1_options.inScope !== void 0 ? gen1_options.inScope : true;
        ugly = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "ugly") && gen1_options.ugly !== void 0 ? gen1_options.ugly : false;
        global = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "global") && gen1_options.global !== void 0 ? gen1_options.global : false;
        returnResult = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "returnResult") && gen1_options.returnResult !== void 0 ? gen1_options.returnResult : false;
        async = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "async") && gen1_options.async !== void 0 ? gen1_options.async : false;
        terms = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "terms") && gen1_options.terms !== void 0 ? gen1_options.terms : createTerms();
        var parser, statements, moduleTerm, code, memoryStream, error;
        parser = createParser({
            terms: terms
        });
        statements = parser.parse(pogo);
        if (async) {
            statements.asyncify();
        }
        moduleTerm = terms.module(statements, {
            inScope: inScope,
            global: global,
            returnLastStatement: returnResult
        });
        code = generateCode(moduleTerm);
        if (parser.errors.hasErrors()) {
            memoryStream = new ms.MemoryStream;
            parser.errors.printErrors(sourceLocationPrinter({
                filename: filename,
                source: pogo
            }), memoryStream);
            error = new Error(memoryStream.toString());
            error.isSemanticErrors = true;
            throw error;
        } else {
            if (ugly) {
                return code;
            } else {
                return beautify(code);
            }
        }
    };
    exports.evaluate = function(pogo, gen2_options) {
        var self = this;
        var definitions, ugly, global;
        definitions = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "definitions") && gen2_options.definitions !== void 0 ? gen2_options.definitions : {};
        ugly = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "ugly") && gen2_options.ugly !== void 0 ? gen2_options.ugly : true;
        global = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "global") && gen2_options.global !== void 0 ? gen2_options.global : false;
        var js, definitionNames, parameters, runScript, definitionValues;
        js = exports.compile(pogo, {
            ugly: ugly,
            inScope: !global,
            global: global,
            returnResult: !global
        });
        definitionNames = Object.keys(definitions);
        parameters = definitionNames.join(",");
        runScript = new Function(parameters, "return " + js + ";");
        definitionValues = function() {
            var gen3_results, gen4_items, gen5_i, name;
            gen3_results = [];
            gen4_items = definitionNames;
            for (gen5_i = 0; gen5_i < gen4_items.length; ++gen5_i) {
                name = gen4_items[gen5_i];
                gen3_results.push(definitions[name]);
            }
            return gen3_results;
        }();
        return runScript.apply(undefined, definitionValues);
    };
    sourceLocationPrinter = function(gen6_options) {
        var filename, source;
        filename = gen6_options !== void 0 && Object.prototype.hasOwnProperty.call(gen6_options, "filename") && gen6_options.filename !== void 0 ? gen6_options.filename : void 0;
        source = gen6_options !== void 0 && Object.prototype.hasOwnProperty.call(gen6_options, "source") && gen6_options.source !== void 0 ? gen6_options.source : void 0;
        return object(function() {
            var self = this;
            self.linesInRange = function(range) {
                var self = this;
                var lines;
                lines = source.split(/\n/);
                return lines.slice(range.from - 1, range.to);
            };
            self.printLinesInRange = function(gen7_options) {
                var self = this;
                var prefix, from, to, buffer;
                prefix = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "prefix") && gen7_options.prefix !== void 0 ? gen7_options.prefix : "";
                from = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "from") && gen7_options.from !== void 0 ? gen7_options.from : void 0;
                to = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "to") && gen7_options.to !== void 0 ? gen7_options.to : void 0;
                buffer = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "buffer") && gen7_options.buffer !== void 0 ? gen7_options.buffer : buffer;
                var gen8_items, gen9_i, line;
                gen8_items = self.linesInRange({
                    from: from,
                    to: to
                });
                for (gen9_i = 0; gen9_i < gen8_items.length; ++gen9_i) {
                    line = gen8_items[gen9_i];
                    buffer.write(prefix + line + "\n");
                }
                return void 0;
            };
            self.printLocation = function(location, buffer) {
                var self = this;
                var spaces, markers;
                buffer.write(filename + ":" + location.firstLine + "\n");
                if (location.firstLine === location.lastLine) {
                    self.printLinesInRange({
                        from: location.firstLine,
                        to: location.lastLine,
                        buffer: buffer
                    });
                    spaces = self.times(" ", location.firstColumn);
                    markers = self.times("^", location.lastColumn - location.firstColumn);
                    return buffer.write(spaces + markers + "\n");
                } else {
                    return self.printLinesInRange({
                        prefix: "> ",
                        from: location.firstLine,
                        to: location.lastLine,
                        buffer: buffer
                    });
                }
            };
            return self.times = function(s, n) {
                var self = this;
                var strings, i;
                strings = [];
                for (i = 0; i < n; ++i) {
                    strings.push(s);
                }
                return strings.join("");
            };
        });
    };
}).call(this);
});

require.define("/lib/parser/parser.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var ms, createParserContext, createDynamicLexer, parser, jisonLexer;
    ms = require("../../lib/memorystream");
    createParserContext = require("./parserContext").createParserContext;
    createDynamicLexer = require("./dynamicLexer").createDynamicLexer;
    parser = require("./jisonParser").parser;
    jisonLexer = parser.lexer;
    self.createParser = function(gen1_options) {
        var self = this;
        var terms;
        terms = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "terms") && gen1_options.terms !== void 0 ? gen1_options.terms : terms;
        return {
            parse: function(source) {
                var self = this;
                var dynamicLexer, parserContext;
                dynamicLexer = createDynamicLexer({
                    nextLexer: jisonLexer
                });
                parserContext = createParserContext({
                    terms: terms
                });
                parserContext.lexer = dynamicLexer;
                jisonLexer.yy = parserContext;
                parser.yy = parserContext;
                parser.lexer = dynamicLexer;
                return parser.parse(source);
            },
            errors: terms.errors,
            lex: function(source) {
                var self = this;
                var tokens, lexer, parserContext, tokenIndex, token, text, lexerToken;
                tokens = [];
                lexer = createDynamicLexer({
                    nextLexer: jisonLexer,
                    source: source
                });
                parserContext = createParserContext({
                    terms: terms
                });
                parserContext.lexer = lexer;
                jisonLexer.yy = parserContext;
                tokenIndex = lexer.lex();
                while (tokenIndex !== 1) {
                    token = function() {
                        if (typeof tokenIndex === "number") {
                            return parser.terminals_[tokenIndex];
                        } else if (tokenIndex === "") {
                            return undefined;
                        } else {
                            return tokenIndex;
                        }
                    }();
                    text = function() {
                        if (lexer.yytext === "") {
                            return undefined;
                        } else if (lexer.yytext === token) {
                            return undefined;
                        } else {
                            return lexer.yytext;
                        }
                    }();
                    lexerToken = function() {
                        if (text) {
                            return [ token, text ];
                        } else {
                            return [ token ];
                        }
                    }();
                    tokens.push(lexerToken);
                    tokenIndex = lexer.lex();
                }
                return tokens;
            }
        };
    };
}).call(this);
});

require.define("/lib/parser/parserContext.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, createIndentStack, createInterpolation, createParserContext;
    _ = require("underscore");
    createIndentStack = require("./indentStack").createIndentStack;
    createInterpolation = require("./interpolation").createInterpolation;
    exports.createParserContext = createParserContext = function(gen1_options) {
        var terms;
        terms = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "terms") && gen1_options.terms !== void 0 ? gen1_options.terms : void 0;
        return object(function() {
            var self = this;
            self.terms = terms;
            self.indentStack = createIndentStack();
            self.tokens = function(tokens) {
                var self = this;
                self.lexer.tokens = tokens;
                return tokens.shift();
            };
            self.setIndentation = function(text) {
                var self = this;
                return self.indentStack.setIndentation(text);
            };
            self.unsetIndentation = function(token) {
                var self = this;
                var tokens;
                tokens = self.indentStack.unsetIndentation();
                tokens.push(token);
                return self.tokens(tokens);
            };
            self.indentation = function(text) {
                var self = this;
                var tokens;
                tokens = self.indentStack.tokensForNewLine(text);
                return self.tokens(tokens);
            };
            self.eof = function() {
                var self = this;
                return self.tokens(self.indentStack.tokensForEof());
            };
            self.interpolation = createInterpolation();
            self.lexOperator = function(parserContext, op) {
                var self = this;
                if (/[?!][.;]/.test(op)) {
                    return parserContext.tokens([ op[0], op[1] ]);
                } else if (/^(=>|\.\.\.|@:|[#@:!?,.=;]|:=)$/.test(op)) {
                    return op;
                } else {
                    return "operator";
                }
            };
            self.loc = function(term, location) {
                var self = this;
                var loc;
                loc = {
                    firstLine: location.first_line,
                    lastLine: location.last_line,
                    firstColumn: location.first_column,
                    lastColumn: location.last_column
                };
                term.location = function() {
                    var self = this;
                    return loc;
                };
                return term;
            };
            self.unindentBy = function(string, columns) {
                var self = this;
                var r;
                r = new RegExp("\\n {" + columns + "}", "g");
                return string.replace(r, "\n");
            };
            self.normaliseString = function(s) {
                var self = this;
                return s.substring(1, s.length - 1).replace(/''/g, "'");
            };
            self.parseRegExp = function(s) {
                var self = this;
                var match;
                match = /^r\/((\n|.)*)\/([^\/]*)$/.exec(s);
                return {
                    pattern: match[1].replace(/\\\//g, "/").replace(/\n/, "\\n"),
                    options: match[3]
                };
            };
            self.actualCharacters = [ [ /\\\\/g, "\\" ], [ /\\b/g, "\b" ], [ /\\f/g, "\f" ], [ /\\n/g, "\n" ], [ /\\0/g, "\0" ], [ /\\r/g, "\r" ], [ /\\t/g, "	" ], [ /\\v/g, "" ], [ /\\'/g, "'" ], [ /\\"/g, '"' ] ];
            self.normaliseInterpolatedString = function(s) {
                var self = this;
                var gen2_items, gen3_i, mapping;
                gen2_items = self.actualCharacters;
                for (gen3_i = 0; gen3_i < gen2_items.length; ++gen3_i) {
                    mapping = gen2_items[gen3_i];
                    s = s.replace(mapping[0], mapping[1]);
                }
                return s;
            };
            self.compressInterpolatedStringComponents = function(components) {
                var self = this;
                var compressedComponents, lastString, gen4_items, gen5_i, component;
                compressedComponents = [];
                lastString = void 0;
                gen4_items = components;
                for (gen5_i = 0; gen5_i < gen4_items.length; ++gen5_i) {
                    component = gen4_items[gen5_i];
                    if (!lastString && component.isString) {
                        lastString = component;
                        compressedComponents.push(lastString);
                    } else if (lastString && component.isString) {
                        lastString.string = lastString.string + component.string;
                    } else {
                        lastString = void 0;
                        compressedComponents.push(component);
                    }
                }
                return compressedComponents;
            };
            self.unindentStringComponentsBy = function(components, columns) {
                var self = this;
                return _.map(components, function(component) {
                    if (component.isString) {
                        return self.terms.string(self.unindentBy(component.string, columns));
                    } else {
                        return component;
                    }
                });
            };
            self.separateExpressionComponentsWithStrings = function(components) {
                var self = this;
                var separatedComponents, lastComponentWasExpression, gen6_items, gen7_i, component;
                separatedComponents = [];
                lastComponentWasExpression = false;
                gen6_items = components;
                for (gen7_i = 0; gen7_i < gen6_items.length; ++gen7_i) {
                    component = gen6_items[gen7_i];
                    if (lastComponentWasExpression && !component.isString) {
                        separatedComponents.push(self.terms.string(""));
                    }
                    separatedComponents.push(component);
                    lastComponentWasExpression = !component.isString;
                }
                return separatedComponents;
            };
            return self.normaliseStringComponentsUnindentingBy = function(components, indentColumns) {
                var self = this;
                return self.separateExpressionComponentsWithStrings(self.compressInterpolatedStringComponents(self.unindentStringComponentsBy(components, indentColumns)));
            };
        });
    };
}).call(this);
});

require.define("/lib/parser/indentStack.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var createIndentStack;
    require("./runtime");
    exports.createIndentStack = createIndentStack = function() {
        return object(function() {
            var self = this;
            self.indents = [ 0 ];
            self.indentationRegex = /\r?\n( *)$/;
            self.multiNewLineRegex = /\r?\n *\r?\n/;
            self.isMultiNewLine = function(text) {
                var self = this;
                return self.multiNewLineRegex.test(text);
            };
            self.hasNewLine = function(text) {
                var self = this;
                return self.indentationRegex.test(text);
            };
            self.indentation = function(newLine) {
                var self = this;
                return self.indentationRegex.exec(newLine)[1].length;
            };
            self.currentIndentation = function() {
                var self = this;
                return self.indents[0];
            };
            self.setIndentation = function(text) {
                var self = this;
                var current;
                if (self.hasNewLine(text)) {
                    self.indents.unshift("bracket");
                    return self.indents.unshift(self.indentation(text));
                } else {
                    current = self.currentIndentation();
                    self.indents.unshift("bracket");
                    return self.indents.unshift(current);
                }
            };
            self.unsetIndentation = function() {
                var self = this;
                var tokens;
                self.indents.shift();
                tokens = [];
                while (self.indents.length > 0 && self.indents[0] !== "bracket") {
                    tokens.push("}");
                    self.indents.shift();
                }
                self.indents.shift();
                return tokens;
            };
            self.tokensForEof = function() {
                var self = this;
                var tokens, indents;
                tokens = [];
                indents = self.indents.length;
                while (indents > 1) {
                    tokens.push("}");
                    --indents;
                }
                tokens.push("eof");
                return tokens;
            };
            return self.tokensForNewLine = function(text) {
                var self = this;
                var currentIndentation, indentation, tokens;
                if (self.hasNewLine(text)) {
                    currentIndentation = self.currentIndentation();
                    indentation = self.indentation(text);
                    if (currentIndentation === indentation) {
                        return [ "," ];
                    } else if (currentIndentation < indentation) {
                        self.indents.unshift(indentation);
                        return [ "@{" ];
                    } else {
                        tokens = [];
                        while (self.indents[0] > indentation) {
                            tokens.push("}");
                            self.indents.shift();
                        }
                        if (self.isMultiNewLine(text)) {
                            tokens.push(",");
                        }
                        if (self.indents[0] < indentation) {
                            tokens.push("@{");
                            self.indents.unshift(indentation);
                        }
                        return tokens;
                    }
                } else {
                    return [];
                }
            };
        });
    };
}).call(this);
});

require.define("/lib/parser/interpolation.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    exports.createInterpolation = function() {
        var self = this;
        return {
            stack: [],
            startInterpolation: function() {
                var self = this;
                return self.stack.unshift({
                    brackets: 0
                });
            },
            openBracket: function() {
                var self = this;
                return self.stack[0].brackets = self.stack[0].brackets + 1;
            },
            closeBracket: function() {
                var self = this;
                return self.stack[0].brackets = self.stack[0].brackets - 1;
            },
            finishedInterpolation: function() {
                var self = this;
                return self.stack[0].brackets < 0;
            },
            stopInterpolation: function() {
                var self = this;
                return self.stack.shift();
            },
            interpolating: function() {
                var self = this;
                return self.stack.length > 0;
            }
        };
    };
}).call(this);
});

require.define("/lib/parser/dynamicLexer.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var createDynamicLexer;
    exports.createDynamicLexer = createDynamicLexer = function(gen1_options) {
        var nextLexer, source;
        nextLexer = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "nextLexer") && gen1_options.nextLexer !== void 0 ? gen1_options.nextLexer : void 0;
        source = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "source") && gen1_options.source !== void 0 ? gen1_options.source : void 0;
        return object(function() {
            var self = this;
            self.tokens = [];
            self.nextLexer = nextLexer;
            self.lex = function() {
                var self = this;
                var token;
                token = self.tokens.shift();
                if (token) {
                    self.yytext = token;
                    return token;
                } else {
                    token = self.nextLexer.lex();
                    self.yytext = self.nextLexer.yytext;
                    self.yylloc = self.nextLexer.yylloc;
                    self.yyleng = self.nextLexer.yyleng;
                    self.yylineno = self.nextLexer.yylineno;
                    self.match = self.nextLexer.match;
                    return token;
                }
            };
            self.showPosition = function() {
                var self = this;
                return self.nextLexer.showPosition();
            };
            self.setInput = function(input) {
                var self = this;
                return self.nextLexer.setInput(input);
            };
            if (source) {
                return self.setInput(source);
            }
        });
    };
}).call(this);
});

require.define("/lib/parser/jisonParser.js",function(require,module,exports,__dirname,__filename,process,global){/* Jison generated parser */
var parser = (function(){
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"module_statements":3,"statements":4,"eof":5,"statements_list":6,"hash_entries":7,",":8,"expression":9,"statement":10,"arguments":11,"arguments_list":12,"argument":13,":":14,"parameters":15,"parameter_list":16,"=":17,":=":18,"operator_expression":19,"operator_with_newline":20,"operator":21,"unary_operator_expression":22,"object_operation":23,"unary_operator":24,"object_reference_with_newline":25,".":26,"complex_expression":27,"basic_expression_list":28,"terminal_list":29,"terminal":30,"async_operator":31,"!":32,"(":33,")":34,"@":35,"block_start":36,"}":37,"=>":38,"[":39,"]":40,"{":41,"float":42,"integer":43,"identifier":44,"string":45,"reg_exp":46,"interpolated_string":47,"...":48,"@{":49,"interpolated_terminal":50,"start_interpolated_string":51,"interpolated_string_components":52,"end_interpolated_string":53,"interpolated_string_component":54,"interpolated_string_body":55,"escaped_interpolated_string_terminal_start":56,"escape_sequence":57,"$accept":0,"$end":1},
terminals_: {2:"error",5:"eof",8:",",14:":",17:"=",18:":=",21:"operator",26:".",32:"!",33:"(",34:")",35:"@",37:"}",38:"=>",39:"[",40:"]",41:"{",42:"float",43:"integer",44:"identifier",45:"string",46:"reg_exp",48:"...",49:"@{",51:"start_interpolated_string",53:"end_interpolated_string",55:"interpolated_string_body",56:"escaped_interpolated_string_terminal_start",57:"escape_sequence"},
productions_: [0,[3,2],[4,1],[7,3],[7,1],[7,0],[6,3],[6,1],[6,0],[11,1],[11,0],[12,3],[12,1],[13,3],[13,1],[15,1],[15,0],[16,3],[16,1],[10,1],[9,3],[9,3],[9,1],[20,2],[20,1],[19,3],[19,1],[22,1],[22,2],[25,2],[25,1],[23,3],[23,1],[27,1],[28,1],[29,2],[29,2],[29,1],[31,1],[30,3],[30,4],[30,3],[30,4],[30,3],[30,3],[30,1],[30,1],[30,1],[30,1],[30,1],[30,1],[30,1],[36,2],[36,1],[24,1],[24,1],[50,3],[47,3],[47,2],[52,2],[52,1],[54,1],[54,1],[54,1],[54,1]],
performAction: function anonymous(yytext,yyleng,yylineno,yy,yystate,$$,_$) {

var $0 = $$.length - 1;
switch (yystate) {
case 1:return $$[$0-1];
break;
case 2:this.$ = yy.terms.asyncStatements($$[$0]);
break;
case 3:$$[$0-2].push($$[$0].hashEntry()); this.$ = $$[$0-2];
break;
case 4:this.$ = [$$[$0].hashEntry()];
break;
case 5:this.$ = [];
break;
case 6:$$[$0-2].push($$[$0]); this.$ = $$[$0-2];
break;
case 7:this.$ = [$$[$0]];
break;
case 8:this.$ = [];
break;
case 9:this.$ = $$[$0];
break;
case 10:this.$ = [];
break;
case 11:$$[$0-2].push($$[$0]); this.$ = $$[$0-2];
break;
case 12:this.$ = [$$[$0]];
break;
case 13:this.$ = $$[$0-2].definition($$[$0].expression()).hashEntry(true);
break;
case 14:this.$ = $$[$0]
break;
case 15:this.$ = $$[$0];
break;
case 16:this.$ = [];
break;
case 17:$$[$0-2].push($$[$0]); this.$ = $$[$0-2];
break;
case 18:this.$ = [$$[$0]];
break;
case 19:this.$ = $$[$0].expression();
break;
case 20:this.$ = $$[$0-2].definition($$[$0].expression());
break;
case 21:this.$ = $$[$0-2].definition($$[$0].expression(), {assignment: true});
break;
case 22:this.$ = $$[$0];
break;
case 23:this.$ = $$[$0-1]
break;
case 24:this.$ = $$[$0]
break;
case 25:$$[$0-2].addOperatorExpression($$[$0-1], $$[$0]); this.$ = $$[$0-2];
break;
case 26:this.$ = yy.terms.operatorExpression($$[$0]);
break;
case 27:this.$ = $$[$0];
break;
case 28:this.$ = yy.terms.unaryOperatorExpression($$[$0-1], $$[$0].expression());
break;
case 29:this.$ = $$[$0-1]
break;
case 30:this.$ = $$[$0]
break;
case 31:this.$ = $$[$0].objectOperation($$[$0-2].expression());
break;
case 32:this.$ = $$[$0];
break;
case 33:this.$ = yy.terms.complexExpression($$[$0]);
break;
case 34:this.$ = [$$[$0]];
break;
case 35:$$[$0-1].push($$[$0]); this.$ = $$[$0-1];
break;
case 36:$$[$0-1].push($$[$0]); this.$ = $$[$0-1];
break;
case 37:this.$ = [$$[$0]];
break;
case 38:this.$ = yy.loc(yy.terms.asyncArgument(), this._$);
break;
case 39:this.$ = yy.loc(yy.terms.argumentList($$[$0-1]), this._$);
break;
case 40:this.$ = yy.loc(yy.terms.parameters($$[$0-1]), this._$);
break;
case 41:this.$ = yy.loc(yy.terms.block([], $$[$0-1]), this._$);
break;
case 42:this.$ = yy.loc(yy.terms.block([], $$[$0-1], {redefinesSelf: true}), this._$);
break;
case 43:this.$ = yy.loc(yy.terms.list($$[$0-1]), this._$);
break;
case 44:this.$ = yy.loc(yy.terms.hash($$[$0-1]), this._$);
break;
case 45:this.$ = yy.loc(yy.terms.float(parseFloat(yytext)), this._$);
break;
case 46:this.$ = yy.loc(yy.terms.integer(parseInt(yytext, 10)), this._$);
break;
case 47:this.$ = yy.loc(yy.terms.identifier(yytext), this._$);
break;
case 48:this.$ = yy.loc(yy.terms.string(yy.unindentBy(yy.normaliseString(yytext), this._$.first_column + 1)), this._$);
break;
case 49:this.$ = yy.loc(yy.terms.regExp(yy.parseRegExp(yy.unindentBy(yytext, this._$.first_column + 2))), this._$);
break;
case 50:this.$ = yy.loc($$[$0], this._$);
break;
case 51:this.$ = yy.loc(yy.terms.splat(), this._$);
break;
case 52:this.$ = '@{'
break;
case 53:this.$ = '@{'
break;
case 54:this.$ = $$[$0];
break;
case 55:this.$ = $$[$0];
break;
case 56:this.$ = $$[$0-1];
break;
case 57:this.$ = yy.terms.interpolatedString(yy.normaliseStringComponentsUnindentingBy($$[$0-1], this._$.first_column + 1));
break;
case 58:this.$ = yy.terms.interpolatedString([]);
break;
case 59:$$[$0-1].push($$[$0]); this.$ = $$[$0-1];
break;
case 60:this.$ = [$$[$0]];
break;
case 61:this.$ = $$[$0];
break;
case 62:this.$ = yy.terms.string($$[$0]);
break;
case 63:this.$ = yy.terms.string("#");
break;
case 64:this.$ = yy.terms.string(yy.normaliseInterpolatedString($$[$0]));
break;
}
},
table: [{3:1,4:2,5:[2,8],6:3,8:[2,8],9:5,10:4,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{1:[3]},{5:[1,31]},{5:[2,2],8:[1,32],37:[2,2]},{5:[2,7],8:[2,7],37:[2,7]},{5:[2,19],8:[2,19],17:[1,33],18:[1,34],34:[2,19],37:[2,19]},{5:[2,22],8:[2,22],14:[2,22],17:[2,22],18:[2,22],20:35,21:[1,36],34:[2,22],37:[2,22],40:[2,22]},{5:[2,26],8:[2,26],14:[2,26],17:[2,26],18:[2,26],21:[2,26],34:[2,26],37:[2,26],40:[2,26]},{5:[2,27],8:[2,27],14:[2,27],17:[2,27],18:[2,27],21:[2,27],25:37,26:[1,38],34:[2,27],37:[2,27],40:[2,27]},{21:[1,11],22:39,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{5:[2,32],8:[2,32],14:[2,32],17:[2,32],18:[2,32],21:[2,32],26:[2,32],34:[2,32],37:[2,32],40:[2,32]},{21:[2,54],32:[2,54],33:[2,54],35:[2,54],38:[2,54],39:[2,54],41:[2,54],42:[2,54],43:[2,54],44:[2,54],45:[2,54],46:[2,54],48:[2,54],49:[2,54],51:[2,54]},{21:[2,55],32:[2,55],33:[2,55],35:[2,55],38:[2,55],39:[2,55],41:[2,55],42:[2,55],43:[2,55],44:[2,55],45:[2,55],46:[2,55],48:[2,55],49:[2,55],51:[2,55]},{5:[2,33],8:[2,33],14:[2,33],17:[2,33],18:[2,33],21:[2,33],26:[2,33],34:[2,33],37:[2,33],40:[2,33]},{5:[2,34],8:[2,34],14:[2,34],17:[2,34],18:[2,34],21:[2,34],26:[2,34],30:40,31:41,32:[1,42],33:[1,16],34:[2,34],35:[1,17],36:18,37:[2,34],38:[1,19],39:[1,20],40:[2,34],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{5:[2,37],8:[2,37],14:[2,37],17:[2,37],18:[2,37],21:[2,37],26:[2,37],32:[2,37],33:[2,37],34:[2,37],35:[2,37],37:[2,37],38:[2,37],39:[2,37],40:[2,37],41:[2,37],42:[2,37],43:[2,37],44:[2,37],45:[2,37],46:[2,37],48:[2,37],49:[2,37],51:[2,37]},{9:46,10:47,11:43,12:44,13:45,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],34:[2,10],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{33:[1,48],41:[1,49]},{4:50,6:3,8:[2,8],9:5,10:4,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,37:[2,8],38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{35:[1,52],36:51,49:[1,29]},{9:46,10:47,11:53,12:44,13:45,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],40:[2,10],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{7:54,8:[2,5],9:55,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,37:[2,5],38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{5:[2,45],8:[2,45],14:[2,45],17:[2,45],18:[2,45],21:[2,45],26:[2,45],32:[2,45],33:[2,45],34:[2,45],35:[2,45],37:[2,45],38:[2,45],39:[2,45],40:[2,45],41:[2,45],42:[2,45],43:[2,45],44:[2,45],45:[2,45],46:[2,45],48:[2,45],49:[2,45],51:[2,45]},{5:[2,46],8:[2,46],14:[2,46],17:[2,46],18:[2,46],21:[2,46],26:[2,46],32:[2,46],33:[2,46],34:[2,46],35:[2,46],37:[2,46],38:[2,46],39:[2,46],40:[2,46],41:[2,46],42:[2,46],43:[2,46],44:[2,46],45:[2,46],46:[2,46],48:[2,46],49:[2,46],51:[2,46]},{5:[2,47],8:[2,47],14:[2,47],17:[2,47],18:[2,47],21:[2,47],26:[2,47],32:[2,47],33:[2,47],34:[2,47],35:[2,47],37:[2,47],38:[2,47],39:[2,47],40:[2,47],41:[2,47],42:[2,47],43:[2,47],44:[2,47],45:[2,47],46:[2,47],48:[2,47],49:[2,47],51:[2,47]},{5:[2,48],8:[2,48],14:[2,48],17:[2,48],18:[2,48],21:[2,48],26:[2,48],32:[2,48],33:[2,48],34:[2,48],35:[2,48],37:[2,48],38:[2,48],39:[2,48],40:[2,48],41:[2,48],42:[2,48],43:[2,48],44:[2,48],45:[2,48],46:[2,48],48:[2,48],49:[2,48],51:[2,48]},{5:[2,49],8:[2,49],14:[2,49],17:[2,49],18:[2,49],21:[2,49],26:[2,49],32:[2,49],33:[2,49],34:[2,49],35:[2,49],37:[2,49],38:[2,49],39:[2,49],40:[2,49],41:[2,49],42:[2,49],43:[2,49],44:[2,49],45:[2,49],46:[2,49],48:[2,49],49:[2,49],51:[2,49]},{5:[2,50],8:[2,50],14:[2,50],17:[2,50],18:[2,50],21:[2,50],26:[2,50],32:[2,50],33:[2,50],34:[2,50],35:[2,50],37:[2,50],38:[2,50],39:[2,50],40:[2,50],41:[2,50],42:[2,50],43:[2,50],44:[2,50],45:[2,50],46:[2,50],48:[2,50],49:[2,50],51:[2,50]},{5:[2,51],8:[2,51],14:[2,51],17:[2,51],18:[2,51],21:[2,51],26:[2,51],32:[2,51],33:[2,51],34:[2,51],35:[2,51],37:[2,51],38:[2,51],39:[2,51],40:[2,51],41:[2,51],42:[2,51],43:[2,51],44:[2,51],45:[2,51],46:[2,51],48:[2,51],49:[2,51],51:[2,51]},{8:[2,53],21:[2,53],32:[2,53],33:[2,53],35:[2,53],37:[2,53],38:[2,53],39:[2,53],41:[2,53],42:[2,53],43:[2,53],44:[2,53],45:[2,53],46:[2,53],48:[2,53],49:[2,53],51:[2,53]},{33:[1,63],50:59,52:56,53:[1,57],54:58,55:[1,60],56:[1,61],57:[1,62]},{1:[2,1]},{9:5,10:64,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{9:65,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{9:66,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{21:[1,11],22:67,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{8:[1,68],21:[2,24],32:[2,24],33:[2,24],35:[2,24],38:[2,24],39:[2,24],41:[2,24],42:[2,24],43:[2,24],44:[2,24],45:[2,24],46:[2,24],48:[2,24],49:[2,24],51:[2,24]},{27:69,28:13,29:14,30:15,33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{8:[1,70],33:[2,30],35:[2,30],38:[2,30],39:[2,30],41:[2,30],42:[2,30],43:[2,30],44:[2,30],45:[2,30],46:[2,30],48:[2,30],49:[2,30],51:[2,30]},{5:[2,28],8:[2,28],14:[2,28],17:[2,28],18:[2,28],21:[2,28],34:[2,28],37:[2,28],40:[2,28]},{5:[2,35],8:[2,35],14:[2,35],17:[2,35],18:[2,35],21:[2,35],26:[2,35],32:[2,35],33:[2,35],34:[2,35],35:[2,35],37:[2,35],38:[2,35],39:[2,35],40:[2,35],41:[2,35],42:[2,35],43:[2,35],44:[2,35],45:[2,35],46:[2,35],48:[2,35],49:[2,35],51:[2,35]},{5:[2,36],8:[2,36],14:[2,36],17:[2,36],18:[2,36],21:[2,36],26:[2,36],32:[2,36],33:[2,36],34:[2,36],35:[2,36],37:[2,36],38:[2,36],39:[2,36],40:[2,36],41:[2,36],42:[2,36],43:[2,36],44:[2,36],45:[2,36],46:[2,36],48:[2,36],49:[2,36],51:[2,36]},{5:[2,38],8:[2,38],14:[2,38],17:[2,38],18:[2,38],21:[2,38],26:[2,38],32:[2,38],33:[2,38],34:[2,38],35:[2,38],37:[2,38],38:[2,38],39:[2,38],40:[2,38],41:[2,38],42:[2,38],43:[2,38],44:[2,38],45:[2,38],46:[2,38],48:[2,38],49:[2,38],51:[2,38]},{34:[1,71]},{8:[1,72],34:[2,9],40:[2,9]},{8:[2,12],34:[2,12],40:[2,12]},{8:[2,19],14:[1,73],17:[1,33],18:[1,34],34:[2,19],40:[2,19]},{8:[2,14],34:[2,14],40:[2,14]},{9:5,10:76,15:74,16:75,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],34:[2,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{8:[2,52],21:[2,52],32:[2,52],33:[2,52],35:[2,52],37:[2,52],38:[2,52],39:[2,52],41:[2,52],42:[2,52],43:[2,52],44:[2,52],45:[2,52],46:[2,52],48:[2,52],49:[2,52],51:[2,52]},{37:[1,77]},{4:78,6:3,8:[2,8],9:5,10:4,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,37:[2,8],38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{41:[1,49]},{40:[1,79]},{8:[1,81],37:[1,80]},{8:[2,4],17:[1,33],18:[1,34],37:[2,4]},{33:[1,63],50:59,53:[1,82],54:83,55:[1,60],56:[1,61],57:[1,62]},{5:[2,58],8:[2,58],14:[2,58],17:[2,58],18:[2,58],21:[2,58],26:[2,58],32:[2,58],33:[2,58],34:[2,58],35:[2,58],37:[2,58],38:[2,58],39:[2,58],40:[2,58],41:[2,58],42:[2,58],43:[2,58],44:[2,58],45:[2,58],46:[2,58],48:[2,58],49:[2,58],51:[2,58]},{33:[2,60],53:[2,60],55:[2,60],56:[2,60],57:[2,60]},{33:[2,61],53:[2,61],55:[2,61],56:[2,61],57:[2,61]},{33:[2,62],53:[2,62],55:[2,62],56:[2,62],57:[2,62]},{33:[2,63],53:[2,63],55:[2,63],56:[2,63],57:[2,63]},{33:[2,64],53:[2,64],55:[2,64],56:[2,64],57:[2,64]},{9:5,10:84,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{5:[2,6],8:[2,6],37:[2,6]},{5:[2,20],8:[2,20],14:[2,20],17:[1,33],18:[1,34],34:[2,20],37:[2,20],40:[2,20]},{5:[2,21],8:[2,21],14:[2,21],17:[1,33],18:[1,34],34:[2,21],37:[2,21],40:[2,21]},{5:[2,25],8:[2,25],14:[2,25],17:[2,25],18:[2,25],21:[2,25],34:[2,25],37:[2,25],40:[2,25]},{21:[2,23],32:[2,23],33:[2,23],35:[2,23],38:[2,23],39:[2,23],41:[2,23],42:[2,23],43:[2,23],44:[2,23],45:[2,23],46:[2,23],48:[2,23],49:[2,23],51:[2,23]},{5:[2,31],8:[2,31],14:[2,31],17:[2,31],18:[2,31],21:[2,31],26:[2,31],34:[2,31],37:[2,31],40:[2,31]},{33:[2,29],35:[2,29],38:[2,29],39:[2,29],41:[2,29],42:[2,29],43:[2,29],44:[2,29],45:[2,29],46:[2,29],48:[2,29],49:[2,29],51:[2,29]},{5:[2,39],8:[2,39],14:[2,39],17:[2,39],18:[2,39],21:[2,39],26:[2,39],32:[2,39],33:[2,39],34:[2,39],35:[2,39],37:[2,39],38:[2,39],39:[2,39],40:[2,39],41:[2,39],42:[2,39],43:[2,39],44:[2,39],45:[2,39],46:[2,39],48:[2,39],49:[2,39],51:[2,39]},{9:46,10:47,13:85,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{9:86,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{34:[1,87]},{8:[1,88],34:[2,15]},{8:[2,18],34:[2,18]},{5:[2,41],8:[2,41],14:[2,41],17:[2,41],18:[2,41],21:[2,41],26:[2,41],32:[2,41],33:[2,41],34:[2,41],35:[2,41],37:[2,41],38:[2,41],39:[2,41],40:[2,41],41:[2,41],42:[2,41],43:[2,41],44:[2,41],45:[2,41],46:[2,41],48:[2,41],49:[2,41],51:[2,41]},{37:[1,89]},{5:[2,43],8:[2,43],14:[2,43],17:[2,43],18:[2,43],21:[2,43],26:[2,43],32:[2,43],33:[2,43],34:[2,43],35:[2,43],37:[2,43],38:[2,43],39:[2,43],40:[2,43],41:[2,43],42:[2,43],43:[2,43],44:[2,43],45:[2,43],46:[2,43],48:[2,43],49:[2,43],51:[2,43]},{5:[2,44],8:[2,44],14:[2,44],17:[2,44],18:[2,44],21:[2,44],26:[2,44],32:[2,44],33:[2,44],34:[2,44],35:[2,44],37:[2,44],38:[2,44],39:[2,44],40:[2,44],41:[2,44],42:[2,44],43:[2,44],44:[2,44],45:[2,44],46:[2,44],48:[2,44],49:[2,44],51:[2,44]},{9:90,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{5:[2,57],8:[2,57],14:[2,57],17:[2,57],18:[2,57],21:[2,57],26:[2,57],32:[2,57],33:[2,57],34:[2,57],35:[2,57],37:[2,57],38:[2,57],39:[2,57],40:[2,57],41:[2,57],42:[2,57],43:[2,57],44:[2,57],45:[2,57],46:[2,57],48:[2,57],49:[2,57],51:[2,57]},{33:[2,59],53:[2,59],55:[2,59],56:[2,59],57:[2,59]},{34:[1,91]},{8:[2,11],34:[2,11],40:[2,11]},{8:[2,13],17:[1,33],18:[1,34],34:[2,13],40:[2,13]},{5:[2,40],8:[2,40],14:[2,40],17:[2,40],18:[2,40],21:[2,40],26:[2,40],32:[2,40],33:[2,40],34:[2,40],35:[2,40],37:[2,40],38:[2,40],39:[2,40],40:[2,40],41:[2,40],42:[2,40],43:[2,40],44:[2,40],45:[2,40],46:[2,40],48:[2,40],49:[2,40],51:[2,40]},{9:5,10:92,19:6,21:[1,11],22:7,23:8,24:9,27:10,28:13,29:14,30:15,32:[1,12],33:[1,16],35:[1,17],36:18,38:[1,19],39:[1,20],41:[1,21],42:[1,22],43:[1,23],44:[1,24],45:[1,25],46:[1,26],47:27,48:[1,28],49:[1,29],51:[1,30]},{5:[2,42],8:[2,42],14:[2,42],17:[2,42],18:[2,42],21:[2,42],26:[2,42],32:[2,42],33:[2,42],34:[2,42],35:[2,42],37:[2,42],38:[2,42],39:[2,42],40:[2,42],41:[2,42],42:[2,42],43:[2,42],44:[2,42],45:[2,42],46:[2,42],48:[2,42],49:[2,42],51:[2,42]},{8:[2,3],17:[1,33],18:[1,34],37:[2,3]},{33:[2,56],53:[2,56],55:[2,56],56:[2,56],57:[2,56]},{8:[2,17],34:[2,17]}],
defaultActions: {31:[2,1]},
parseError: function parseError(str, hash) {
    throw new Error(str);
},
parse: function parse(input) {
    var self = this, stack = [0], vstack = [null], lstack = [], table = this.table, yytext = "", yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    this.lexer.setInput(input);
    this.lexer.yy = this.yy;
    this.yy.lexer = this.lexer;
    this.yy.parser = this;
    if (typeof this.lexer.yylloc == "undefined")
        this.lexer.yylloc = {};
    var yyloc = this.lexer.yylloc;
    lstack.push(yyloc);
    var ranges = this.lexer.options && this.lexer.options.ranges;
    if (typeof this.yy.parseError === "function")
        this.parseError = this.yy.parseError;
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    function lex() {
        var token;
        token = self.lexer.lex() || 1;
        if (typeof token !== "number") {
            token = self.symbols_[token] || token;
        }
        return token;
    }
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == "undefined") {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
        if (typeof action === "undefined" || !action.length || !action[0]) {
            var errStr = "";
            if (!recovering) {
                expected = [];
                for (p in table[state])
                    if (this.terminals_[p] && p > 2) {
                        expected.push("'" + this.terminals_[p] + "'");
                    }
                if (this.lexer.showPosition) {
                    errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
                } else {
                    errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1?"end of input":"'" + (this.terminals_[symbol] || symbol) + "'");
                }
                this.parseError(errStr, {text: this.lexer.match, token: this.terminals_[symbol] || symbol, line: this.lexer.yylineno, loc: yyloc, expected: expected});
            }
        }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(this.lexer.yytext);
            lstack.push(this.lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = this.lexer.yyleng;
                yytext = this.lexer.yytext;
                yylineno = this.lexer.yylineno;
                yyloc = this.lexer.yylloc;
                if (recovering > 0)
                    recovering--;
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {first_line: lstack[lstack.length - (len || 1)].first_line, last_line: lstack[lstack.length - 1].last_line, first_column: lstack[lstack.length - (len || 1)].first_column, last_column: lstack[lstack.length - 1].last_column};
            if (ranges) {
                yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
            }
            r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
            if (typeof r !== "undefined") {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}
};
undefined/* Jison generated lexer */
var lexer = (function(){
var lexer = ({EOF:1,
parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },
setInput:function (input) {
        this._input = input;
        this._more = this._less = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {first_line:1,first_column:0,last_line:1,last_column:0};
        if (this.options.ranges) this.yylloc.range = [0,0];
        this.offset = 0;
        return this;
    },
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) this.yylloc.range[1]++;

        this._input = this._input.slice(1);
        return ch;
    },
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length-len-1);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length-1);
        this.matched = this.matched.substr(0, this.matched.length-1);

        if (lines.length-1) this.yylineno -= lines.length-1;
        var r = this.yylloc.range;

        this.yylloc = {first_line: this.yylloc.first_line,
          last_line: this.yylineno+1,
          first_column: this.yylloc.first_column,
          last_column: lines ?
              (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length:
              this.yylloc.first_column - len
          };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        return this;
    },
more:function () {
        this._more = true;
        return this;
    },
less:function (n) {
        this.unput(this.match.slice(n));
    },
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20)+(next.length > 20 ? '...':'')).replace(/\n/g, "");
    },
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c+"^";
    },
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) this.done = true;

        var token,
            match,
            tempMatch,
            index,
            col,
            lines;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i=0;i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (!this.options.flex) break;
            }
        }
        if (match) {
            lines = match[0].match(/(?:\r\n?|\n).*/g);
            if (lines) this.yylineno += lines.length;
            this.yylloc = {first_line: this.yylloc.last_line,
                           last_line: this.yylineno+1,
                           first_column: this.yylloc.last_column,
                           last_column: lines ? lines[lines.length-1].length-lines[lines.length-1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length};
            this.yytext += match[0];
            this.match += match[0];
            this.matches = match;
            this.yyleng = this.yytext.length;
            if (this.options.ranges) {
                this.yylloc.range = [this.offset, this.offset += this.yyleng];
            }
            this._more = false;
            this._input = this._input.slice(match[0].length);
            this.matched += match[0];
            token = this.performAction.call(this, this.yy, this, rules[index],this.conditionStack[this.conditionStack.length-1]);
            if (this.done && this._input) this.done = false;
            if (token) return token;
            else return;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line '+(this.yylineno+1)+'. Unrecognized text.\n'+this.showPosition(),
                    {text: "", token: null, line: this.yylineno});
        }
    },
lex:function lex() {
        var r = this.next();
        if (typeof r !== 'undefined') {
            return r;
        } else {
            return this.lex();
        }
    },
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },
popState:function popState() {
        return this.conditionStack.pop();
    },
_currentRules:function _currentRules() {
        return this.conditions[this.conditionStack[this.conditionStack.length-1]].rules;
    },
topState:function () {
        return this.conditionStack[this.conditionStack.length-2];
    },
pushState:function begin(condition) {
        this.begin(condition);
    }});
lexer.options = {};
lexer.performAction = function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {

var YYSTATE=YY_START
switch($avoiding_name_collisions) {
case 0:/* ignore hashbang */
break;
case 1:/* ignore whitespace */
break;
case 2:return yy.eof();
break;
case 3:return yy.eof();
break;
case 4:var indentation = yy.indentation(yy_.yytext); if (indentation) { return indentation; }
break;
case 5:yy.setIndentation(yy_.yytext); if (yy.interpolation.interpolating()) {yy.interpolation.openBracket()} return "(";
break;
case 6:if (yy.interpolation.interpolating()) {yy.interpolation.closeBracket(); if (yy.interpolation.finishedInterpolation()) {this.popState(); yy.interpolation.stopInterpolation()}} return yy.unsetIndentation(')');
break;
case 7:yy.setIndentation(yy_.yytext); return 41;
break;
case 8:return yy.unsetIndentation('}');
break;
case 9:yy.setIndentation(yy_.yytext); return 39;
break;
case 10:return yy.unsetIndentation(']')
break;
case 11:return yy.indentation(yy_.yytext);
break;
case 12:return 42;
break;
case 13:return 43;
break;
case 14:return "operator";
break;
case 15:return "...";
break;
case 16:return yy.lexOperator(yy, yy_.yytext);
break;
case 17:return 46;
break;
case 18:return 44;
break;
case 19:return 5;
break;
case 20:return 45;
break;
case 21:this.begin('interpolated_string'); return 51;
break;
case 22:return 56;
break;
case 23:yy.setIndentation('('); yy.interpolation.startInterpolation(); this.begin('INITIAL'); return 33;
break;
case 24:return 55;
break;
case 25:this.popState(); return 53;
break;
case 26:return 57;
break;
case 27:return 55;
break;
case 28:return 'non_token';
break;
}
};
lexer.rules = [/^(?:^#![^\n]*)/,/^(?: +)/,/^(?:\s*$)/,/^(?:\s*((\/\*([^*](\*[^\/]|))*(\*\/|$)|\/\/[^\n]*)\s*)+$)/,/^(?:\s*((\/\*([^*](\*[^\/]|))*(\*\/|$)|\/\/[^\n]*)\s*)+)/,/^(?:\(\s*)/,/^(?:\s*\))/,/^(?:{\s*)/,/^(?:\s*})/,/^(?:\[\s*)/,/^(?:\s*\])/,/^(?:(\r?\n *)*\r?\n *)/,/^(?:[0-9]+\.[0-9]+)/,/^(?:[0-9]+)/,/^(?:@[a-zA-Z_$][a-zA-Z_$0-9]*)/,/^(?:\.\.\.)/,/^(?:([:;=,?!.@~#%^&*+<>\/?\\|-])+)/,/^(?:r\/([^\\\/]*\\.)*[^\/]*\/(img|mgi|gim|igm|gmi|mig|im|ig|gm|mg|mi|gi|i|m|g|))/,/^(?:[a-zA-Z_$][a-zA-Z_$0-9]*)/,/^(?:$)/,/^(?:'([^']*'')*[^']*')/,/^(?:")/,/^(?:\\#)/,/^(?:#\()/,/^(?:#)/,/^(?:")/,/^(?:\\.)/,/^(?:[^"#\\]*)/,/^(?:.)/];
lexer.conditions = {"interpolated_string":{"rules":[22,23,24,25,26,27],"inclusive":false},"interpolated_string_terminal":{"rules":[],"inclusive":false},"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,28],"inclusive":true}};
return lexer;})()
parser.lexer = lexer;
function Parser () { this.yy = {}; }Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();
if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); }
}

});

require.define("/node_modules/uglify-js/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./uglify-js.js"}
});

require.define("/node_modules/uglify-js/uglify-js.js",function(require,module,exports,__dirname,__filename,process,global){//convienence function(src, [options]);
function uglify(orig_code, options){
  options || (options = {});
  var jsp = uglify.parser;
  var pro = uglify.uglify;

  var ast = jsp.parse(orig_code, options.strict_semicolons); // parse code and get the initial AST
  ast = pro.ast_mangle(ast, options.mangle_options); // get a new AST with mangled names
  ast = pro.ast_squeeze(ast, options.squeeze_options); // get an AST with compression optimizations
  var final_code = pro.gen_code(ast, options.gen_options); // compressed code here
  return final_code;
};

uglify.parser = require("./lib/parse-js");
uglify.uglify = require("./lib/process");
uglify.consolidator = require("./lib/consolidator");

module.exports = uglify

});

require.define("/node_modules/uglify-js/lib/parse-js.js",function(require,module,exports,__dirname,__filename,process,global){/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.

  This version is suitable for Node.js.  With minimal changes (the
  exports stuff) it should work on any JS platform.

  This file contains the tokenizer/parser.  It is a port to JavaScript
  of parse-js [1], a JavaScript parser library written in Common Lisp
  by Marijn Haverbeke.  Thank you Marijn!

  [1] http://marijn.haverbeke.nl/parse-js/

  Exported functions:

    - tokenizer(code) -- returns a function.  Call the returned
      function to fetch the next token.

    - parse(code) -- returns an AST of the given JavaScript code.

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2010 (c) Mihai Bazon <mihai.bazon@gmail.com>
    Based on parse-js (http://marijn.haverbeke.nl/parse-js/).

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

/* -----[ Tokenizer (constants) ]----- */

var KEYWORDS = array_to_hash([
    "break",
    "case",
    "catch",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "finally",
    "for",
    "function",
    "if",
    "in",
    "instanceof",
    "new",
    "return",
    "switch",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with"
]);

var RESERVED_WORDS = array_to_hash([
    "abstract",
    "boolean",
    "byte",
    "char",
    "class",
    "double",
    "enum",
    "export",
    "extends",
    "final",
    "float",
    "goto",
    "implements",
    "import",
    "int",
    "interface",
    "long",
    "native",
    "package",
    "private",
    "protected",
    "public",
    "short",
    "static",
    "super",
    "synchronized",
    "throws",
    "transient",
    "volatile"
]);

var KEYWORDS_BEFORE_EXPRESSION = array_to_hash([
    "return",
    "new",
    "delete",
    "throw",
    "else",
    "case"
]);

var KEYWORDS_ATOM = array_to_hash([
    "false",
    "null",
    "true",
    "undefined"
]);

var OPERATOR_CHARS = array_to_hash(characters("+-*&%=<>!?|~^"));

var RE_HEX_NUMBER = /^0x[0-9a-f]+$/i;
var RE_OCT_NUMBER = /^0[0-7]+$/;
var RE_DEC_NUMBER = /^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i;

var OPERATORS = array_to_hash([
    "in",
    "instanceof",
    "typeof",
    "new",
    "void",
    "delete",
    "++",
    "--",
    "+",
    "-",
    "!",
    "~",
    "&",
    "|",
    "^",
    "*",
    "/",
    "%",
    ">>",
    "<<",
    ">>>",
    "<",
    ">",
    "<=",
    ">=",
    "==",
    "===",
    "!=",
    "!==",
    "?",
    "=",
    "+=",
    "-=",
    "/=",
    "*=",
    "%=",
    ">>=",
    "<<=",
    ">>>=",
    "|=",
    "^=",
    "&=",
    "&&",
    "||"
]);

var WHITESPACE_CHARS = array_to_hash(characters(" \u00a0\n\r\t\f\u000b\u200b\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\uFEFF"));

var PUNC_BEFORE_EXPRESSION = array_to_hash(characters("[{(,.;:"));

var PUNC_CHARS = array_to_hash(characters("[]{}(),;:"));

var REGEXP_MODIFIERS = array_to_hash(characters("gmsiy"));

/* -----[ Tokenizer ]----- */

var UNICODE = {  // Unicode 6.1
    letter: new RegExp("[\\u0041-\\u005A\\u0061-\\u007A\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u0527\\u0531-\\u0556\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0620-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07FA\\u0800-\\u0815\\u081A\\u0824\\u0828\\u0840-\\u0858\\u08A0\\u08A2-\\u08AC\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0971-\\u0977\\u0979-\\u097F\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C33\\u0C35-\\u0C39\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CBD\\u0CDE\\u0CE0\\u0CE1\\u0CF1\\u0CF2\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D3A\\u0D3D\\u0D4E\\u0D60\\u0D61\\u0D7A-\\u0D7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0EC6\\u0EDC-\\u0EDF\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0F88-\\u0F8C\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\u108E\\u10A0-\\u10C5\\u10C7\\u10CD\\u10D0-\\u10FA\\u10FC-\\u1248\\u124A-\\u124D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u128A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u1401-\\u166C\\u166F-\\u167F\\u1681-\\u169A\\u16A0-\\u16EA\\u16EE-\\u16F0\\u1700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC\\u1820-\\u1877\\u1880-\\u18A8\\u18AA\\u18B0-\\u18F5\\u1900-\\u191C\\u1950-\\u196D\\u1970-\\u1974\\u1980-\\u19AB\\u19C1-\\u19C7\\u1A00-\\u1A16\\u1A20-\\u1A54\\u1AA7\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\u1BAE\\u1BAF\\u1BBA-\\u1BE5\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C7D\\u1CE9-\\u1CEC\\u1CEE-\\u1CF1\\u1CF5\\u1CF6\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2071\\u207F\\u2090-\\u209C\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213C-\\u213F\\u2145-\\u2149\\u214E\\u2160-\\u2188\\u2C00-\\u2C2E\\u2C30-\\u2C5E\\u2C60-\\u2CE4\\u2CEB-\\u2CEE\\u2CF2\\u2CF3\\u2D00-\\u2D25\\u2D27\\u2D2D\\u2D30-\\u2D67\\u2D6F\\u2D80-\\u2D96\\u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2DDE\\u2E2F\\u3005-\\u3007\\u3021-\\u3029\\u3031-\\u3035\\u3038-\\u303C\\u3041-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3105-\\u312D\\u3131-\\u318E\\u31A0-\\u31BA\\u31F0-\\u31FF\\u3400-\\u4DB5\\u4E00-\\u9FCC\\uA000-\\uA48C\\uA4D0-\\uA4FD\\uA500-\\uA60C\\uA610-\\uA61F\\uA62A\\uA62B\\uA640-\\uA66E\\uA67F-\\uA697\\uA6A0-\\uA6EF\\uA717-\\uA71F\\uA722-\\uA788\\uA78B-\\uA78E\\uA790-\\uA793\\uA7A0-\\uA7AA\\uA7F8-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA822\\uA840-\\uA873\\uA882-\\uA8B3\\uA8F2-\\uA8F7\\uA8FB\\uA90A-\\uA925\\uA930-\\uA946\\uA960-\\uA97C\\uA984-\\uA9B2\\uA9CF\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAA60-\\uAA76\\uAA7A\\uAA80-\\uAAAF\\uAAB1\\uAAB5\\uAAB6\\uAAB9-\\uAABD\\uAAC0\\uAAC2\\uAADB-\\uAADD\\uAAE0-\\uAAEA\\uAAF2-\\uAAF4\\uAB01-\\uAB06\\uAB09-\\uAB0E\\uAB11-\\uAB16\\uAB20-\\uAB26\\uAB28-\\uAB2E\\uABC0-\\uABE2\\uAC00-\\uD7A3\\uD7B0-\\uD7C6\\uD7CB-\\uD7FB\\uF900-\\uFA6D\\uFA70-\\uFAD9\\uFB00-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\uFDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF21-\\uFF3A\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFFCF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]"),
    combining_mark: new RegExp("[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-\\u082D\\u0859-\\u085B\\u08E4-\\u08FE\\u0900-\\u0903\\u093A-\\u093C\\u093E-\\u094F\\u0951-\\u0957\\u0962\\u0963\\u0981-\\u0983\\u09BC\\u09BE-\\u09C4\\u09C7\\u09C8\\u09CB-\\u09CD\\u09D7\\u09E2\\u09E3\\u0A01-\\u0A03\\u0A3C\\u0A3E-\\u0A42\\u0A47\\u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81-\\u0A83\\u0ABC\\u0ABE-\\u0AC5\\u0AC7-\\u0AC9\\u0ACB-\\u0ACD\\u0AE2\\u0AE3\\u0B01-\\u0B03\\u0B3C\\u0B3E-\\u0B44\\u0B47\\u0B48\\u0B4B-\\u0B4D\\u0B56\\u0B57\\u0B62\\u0B63\\u0B82\\u0BBE-\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\u0BCD\\u0BD7\\u0C01-\\u0C03\\u0C3E-\\u0C44\\u0C46-\\u0C48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0C82\\u0C83\\u0CBC\\u0CBE-\\u0CC4\\u0CC6-\\u0CC8\\u0CCA-\\u0CCD\\u0CD5\\u0CD6\\u0CE2\\u0CE3\\u0D02\\u0D03\\u0D3E-\\u0D44\\u0D46-\\u0D48\\u0D4A-\\u0D4D\\u0D57\\u0D62\\u0D63\\u0D82\\u0D83\\u0DCA\\u0DCF-\\u0DD4\\u0DD6\\u0DD8-\\u0DDF\\u0DF2\\u0DF3\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F3E\\u0F3F\\u0F71-\\u0F84\\u0F86\\u0F87\\u0F8D-\\u0F97\\u0F99-\\u0FBC\\u0FC6\\u102B-\\u103E\\u1056-\\u1059\\u105E-\\u1060\\u1062-\\u1064\\u1067-\\u106D\\u1071-\\u1074\\u1082-\\u108D\\u108F\\u109A-\\u109D\\u135D-\\u135F\\u1712-\\u1714\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B4-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920-\\u192B\\u1930-\\u193B\\u19B0-\\u19C0\\u19C8\\u19C9\\u1A17-\\u1A1B\\u1A55-\\u1A5E\\u1A60-\\u1A7C\\u1A7F\\u1B00-\\u1B04\\u1B34-\\u1B44\\u1B6B-\\u1B73\\u1B80-\\u1B82\\u1BA1-\\u1BAD\\u1BE6-\\u1BF3\\u1C24-\\u1C37\\u1CD0-\\u1CD2\\u1CD4-\\u1CE8\\u1CED\\u1CF2-\\u1CF4\\u1DC0-\\u1DE6\\u1DFC-\\u1DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u2D7F\\u2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA674-\\uA67D\\uA69F\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA823-\\uA827\\uA880\\uA881\\uA8B4-\\uA8C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA953\\uA980-\\uA983\\uA9B3-\\uA9C0\\uAA29-\\uAA36\\uAA43\\uAA4C\\uAA4D\\uAA7B\\uAAB0\\uAAB2-\\uAAB4\\uAAB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uAAEB-\\uAAEF\\uAAF5\\uAAF6\\uABE3-\\uABEA\\uABEC\\uABED\\uFB1E\\uFE00-\\uFE0F\\uFE20-\\uFE26]"),
    connector_punctuation: new RegExp("[\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]"),
    digit: new RegExp("[\\u0030-\\u0039\\u0660-\\u0669\\u06F0-\\u06F9\\u07C0-\\u07C9\\u0966-\\u096F\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049\\u1090-\\u1099\\u17E0-\\u17E9\\u1810-\\u1819\\u1946-\\u194F\\u19D0-\\u19D9\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1B50-\\u1B59\\u1BB0-\\u1BB9\\u1C40-\\u1C49\\u1C50-\\u1C59\\uA620-\\uA629\\uA8D0-\\uA8D9\\uA900-\\uA909\\uA9D0-\\uA9D9\\uAA50-\\uAA59\\uABF0-\\uABF9\\uFF10-\\uFF19]")
};

function is_letter(ch) {
    return UNICODE.letter.test(ch);
};

function is_digit(ch) {
    ch = ch.charCodeAt(0);
    return ch >= 48 && ch <= 57;
};

function is_unicode_digit(ch) {
    return UNICODE.digit.test(ch);
}

function is_alphanumeric_char(ch) {
    return is_digit(ch) || is_letter(ch);
};

function is_unicode_combining_mark(ch) {
    return UNICODE.combining_mark.test(ch);
};

function is_unicode_connector_punctuation(ch) {
    return UNICODE.connector_punctuation.test(ch);
};

function is_identifier_start(ch) {
    return ch == "$" || ch == "_" || is_letter(ch);
};

function is_identifier_char(ch) {
    return is_identifier_start(ch)
        || is_unicode_combining_mark(ch)
        || is_unicode_digit(ch)
        || is_unicode_connector_punctuation(ch)
        || ch == "\u200c" // zero-width non-joiner <ZWNJ>
        || ch == "\u200d" // zero-width joiner <ZWJ> (in my ECMA-262 PDF, this is also 200c)
    ;
};

function parse_js_number(num) {
    if (RE_HEX_NUMBER.test(num)) {
        return parseInt(num.substr(2), 16);
    } else if (RE_OCT_NUMBER.test(num)) {
        return parseInt(num.substr(1), 8);
    } else if (RE_DEC_NUMBER.test(num)) {
        return parseFloat(num);
    }
};

function JS_Parse_Error(message, line, col, pos) {
    this.message = message;
    this.line = line + 1;
    this.col = col + 1;
    this.pos = pos + 1;
    this.stack = new Error().stack;
};

JS_Parse_Error.prototype.toString = function() {
    return this.message + " (line: " + this.line + ", col: " + this.col + ", pos: " + this.pos + ")" + "\n\n" + this.stack;
};

function js_error(message, line, col, pos) {
    throw new JS_Parse_Error(message, line, col, pos);
};

function is_token(token, type, val) {
    return token.type == type && (val == null || token.value == val);
};

var EX_EOF = {};

function tokenizer($TEXT) {

    var S = {
        text            : $TEXT.replace(/\r\n?|[\n\u2028\u2029]/g, "\n").replace(/^\uFEFF/, ''),
        pos             : 0,
        tokpos          : 0,
        line            : 0,
        tokline         : 0,
        col             : 0,
        tokcol          : 0,
        newline_before  : false,
        regex_allowed   : false,
        comments_before : []
    };

    function peek() { return S.text.charAt(S.pos); };

    function next(signal_eof, in_string) {
        var ch = S.text.charAt(S.pos++);
        if (signal_eof && !ch)
            throw EX_EOF;
        if (ch == "\n") {
            S.newline_before = S.newline_before || !in_string;
            ++S.line;
            S.col = 0;
        } else {
            ++S.col;
        }
        return ch;
    };

    function eof() {
        return !S.peek();
    };

    function find(what, signal_eof) {
        var pos = S.text.indexOf(what, S.pos);
        if (signal_eof && pos == -1) throw EX_EOF;
        return pos;
    };

    function start_token() {
        S.tokline = S.line;
        S.tokcol = S.col;
        S.tokpos = S.pos;
    };

    function token(type, value, is_comment) {
        S.regex_allowed = ((type == "operator" && !HOP(UNARY_POSTFIX, value)) ||
                           (type == "keyword" && HOP(KEYWORDS_BEFORE_EXPRESSION, value)) ||
                           (type == "punc" && HOP(PUNC_BEFORE_EXPRESSION, value)));
        var ret = {
            type   : type,
            value  : value,
            line   : S.tokline,
            col    : S.tokcol,
            pos    : S.tokpos,
            endpos : S.pos,
            nlb    : S.newline_before
        };
        if (!is_comment) {
            ret.comments_before = S.comments_before;
            S.comments_before = [];
            // make note of any newlines in the comments that came before
            for (var i = 0, len = ret.comments_before.length; i < len; i++) {
                ret.nlb = ret.nlb || ret.comments_before[i].nlb;
            }
        }
        S.newline_before = false;
        return ret;
    };

    function skip_whitespace() {
        while (HOP(WHITESPACE_CHARS, peek()))
            next();
    };

    function read_while(pred) {
        var ret = "", ch = peek(), i = 0;
        while (ch && pred(ch, i++)) {
            ret += next();
            ch = peek();
        }
        return ret;
    };

    function parse_error(err) {
        js_error(err, S.tokline, S.tokcol, S.tokpos);
    };

    function read_num(prefix) {
        var has_e = false, after_e = false, has_x = false, has_dot = prefix == ".";
        var num = read_while(function(ch, i){
            if (ch == "x" || ch == "X") {
                if (has_x) return false;
                return has_x = true;
            }
            if (!has_x && (ch == "E" || ch == "e")) {
                if (has_e) return false;
                return has_e = after_e = true;
            }
            if (ch == "-") {
                if (after_e || (i == 0 && !prefix)) return true;
                return false;
            }
            if (ch == "+") return after_e;
            after_e = false;
            if (ch == ".") {
                if (!has_dot && !has_x && !has_e)
                    return has_dot = true;
                return false;
            }
            return is_alphanumeric_char(ch);
        });
        if (prefix)
            num = prefix + num;
        var valid = parse_js_number(num);
        if (!isNaN(valid)) {
            return token("num", valid);
        } else {
            parse_error("Invalid syntax: " + num);
        }
    };

    function read_escaped_char(in_string) {
        var ch = next(true, in_string);
        switch (ch) {
          case "n" : return "\n";
          case "r" : return "\r";
          case "t" : return "\t";
          case "b" : return "\b";
          case "v" : return "\u000b";
          case "f" : return "\f";
          case "0" : return "\0";
          case "x" : return String.fromCharCode(hex_bytes(2));
          case "u" : return String.fromCharCode(hex_bytes(4));
          case "\n": return "";
          default  : return ch;
        }
    };

    function hex_bytes(n) {
        var num = 0;
        for (; n > 0; --n) {
            var digit = parseInt(next(true), 16);
            if (isNaN(digit))
                parse_error("Invalid hex-character pattern in string");
            num = (num << 4) | digit;
        }
        return num;
    };

    function read_string() {
        return with_eof_error("Unterminated string constant", function(){
            var quote = next(), ret = "";
            for (;;) {
                var ch = next(true);
                if (ch == "\\") {
                    // read OctalEscapeSequence (XXX: deprecated if "strict mode")
                    // https://github.com/mishoo/UglifyJS/issues/178
                    var octal_len = 0, first = null;
                    ch = read_while(function(ch){
                        if (ch >= "0" && ch <= "7") {
                            if (!first) {
                                first = ch;
                                return ++octal_len;
                            }
                            else if (first <= "3" && octal_len <= 2) return ++octal_len;
                            else if (first >= "4" && octal_len <= 1) return ++octal_len;
                        }
                        return false;
                    });
                    if (octal_len > 0) ch = String.fromCharCode(parseInt(ch, 8));
                    else ch = read_escaped_char(true);
                }
                else if (ch == quote) break;
                else if (ch == "\n") throw EX_EOF;
                ret += ch;
            }
            return token("string", ret);
        });
    };

    function read_line_comment() {
        next();
        var i = find("\n"), ret;
        if (i == -1) {
            ret = S.text.substr(S.pos);
            S.pos = S.text.length;
        } else {
            ret = S.text.substring(S.pos, i);
            S.pos = i;
        }
        return token("comment1", ret, true);
    };

    function read_multiline_comment() {
        next();
        return with_eof_error("Unterminated multiline comment", function(){
            var i = find("*/", true),
            text = S.text.substring(S.pos, i);
            S.pos = i + 2;
            S.line += text.split("\n").length - 1;
            S.newline_before = S.newline_before || text.indexOf("\n") >= 0;

            // https://github.com/mishoo/UglifyJS/issues/#issue/100
            if (/^@cc_on/i.test(text)) {
                warn("WARNING: at line " + S.line);
                warn("*** Found \"conditional comment\": " + text);
                warn("*** UglifyJS DISCARDS ALL COMMENTS.  This means your code might no longer work properly in Internet Explorer.");
            }

            return token("comment2", text, true);
        });
    };

    function read_name() {
        var backslash = false, name = "", ch, escaped = false, hex;
        while ((ch = peek()) != null) {
            if (!backslash) {
                if (ch == "\\") escaped = backslash = true, next();
                else if (is_identifier_char(ch)) name += next();
                else break;
            }
            else {
                if (ch != "u") parse_error("Expecting UnicodeEscapeSequence -- uXXXX");
                ch = read_escaped_char();
                if (!is_identifier_char(ch)) parse_error("Unicode char: " + ch.charCodeAt(0) + " is not valid in identifier");
                name += ch;
                backslash = false;
            }
        }
        if (HOP(KEYWORDS, name) && escaped) {
            hex = name.charCodeAt(0).toString(16).toUpperCase();
            name = "\\u" + "0000".substr(hex.length) + hex + name.slice(1);
        }
        return name;
    };

    function read_regexp(regexp) {
        return with_eof_error("Unterminated regular expression", function(){
            var prev_backslash = false, ch, in_class = false;
            while ((ch = next(true))) if (prev_backslash) {
                regexp += "\\" + ch;
                prev_backslash = false;
            } else if (ch == "[") {
                in_class = true;
                regexp += ch;
            } else if (ch == "]" && in_class) {
                in_class = false;
                regexp += ch;
            } else if (ch == "/" && !in_class) {
                break;
            } else if (ch == "\\") {
                prev_backslash = true;
            } else {
                regexp += ch;
            }
            var mods = read_name();
            return token("regexp", [ regexp, mods ]);
        });
    };

    function read_operator(prefix) {
        function grow(op) {
            if (!peek()) return op;
            var bigger = op + peek();
            if (HOP(OPERATORS, bigger)) {
                next();
                return grow(bigger);
            } else {
                return op;
            }
        };
        return token("operator", grow(prefix || next()));
    };

    function handle_slash() {
        next();
        var regex_allowed = S.regex_allowed;
        switch (peek()) {
          case "/":
            S.comments_before.push(read_line_comment());
            S.regex_allowed = regex_allowed;
            return next_token();
          case "*":
            S.comments_before.push(read_multiline_comment());
            S.regex_allowed = regex_allowed;
            return next_token();
        }
        return S.regex_allowed ? read_regexp("") : read_operator("/");
    };

    function handle_dot() {
        next();
        return is_digit(peek())
            ? read_num(".")
            : token("punc", ".");
    };

    function read_word() {
        var word = read_name();
        return !HOP(KEYWORDS, word)
            ? token("name", word)
            : HOP(OPERATORS, word)
            ? token("operator", word)
            : HOP(KEYWORDS_ATOM, word)
            ? token("atom", word)
            : token("keyword", word);
    };

    function with_eof_error(eof_error, cont) {
        try {
            return cont();
        } catch(ex) {
            if (ex === EX_EOF) parse_error(eof_error);
            else throw ex;
        }
    };

    function next_token(force_regexp) {
        if (force_regexp != null)
            return read_regexp(force_regexp);
        skip_whitespace();
        start_token();
        var ch = peek();
        if (!ch) return token("eof");
        if (is_digit(ch)) return read_num();
        if (ch == '"' || ch == "'") return read_string();
        if (HOP(PUNC_CHARS, ch)) return token("punc", next());
        if (ch == ".") return handle_dot();
        if (ch == "/") return handle_slash();
        if (HOP(OPERATOR_CHARS, ch)) return read_operator();
        if (ch == "\\" || is_identifier_start(ch)) return read_word();
        parse_error("Unexpected character '" + ch + "'");
    };

    next_token.context = function(nc) {
        if (nc) S = nc;
        return S;
    };

    return next_token;

};

/* -----[ Parser (constants) ]----- */

var UNARY_PREFIX = array_to_hash([
    "typeof",
    "void",
    "delete",
    "--",
    "++",
    "!",
    "~",
    "-",
    "+"
]);

var UNARY_POSTFIX = array_to_hash([ "--", "++" ]);

var ASSIGNMENT = (function(a, ret, i){
    while (i < a.length) {
        ret[a[i]] = a[i].substr(0, a[i].length - 1);
        i++;
    }
    return ret;
})(
    ["+=", "-=", "/=", "*=", "%=", ">>=", "<<=", ">>>=", "|=", "^=", "&="],
    { "=": true },
    0
);

var PRECEDENCE = (function(a, ret){
    for (var i = 0, n = 1; i < a.length; ++i, ++n) {
        var b = a[i];
        for (var j = 0; j < b.length; ++j) {
            ret[b[j]] = n;
        }
    }
    return ret;
})(
    [
        ["||"],
        ["&&"],
        ["|"],
        ["^"],
        ["&"],
        ["==", "===", "!=", "!=="],
        ["<", ">", "<=", ">=", "in", "instanceof"],
        [">>", "<<", ">>>"],
        ["+", "-"],
        ["*", "/", "%"]
    ],
    {}
);

var STATEMENTS_WITH_LABELS = array_to_hash([ "for", "do", "while", "switch" ]);

var ATOMIC_START_TOKEN = array_to_hash([ "atom", "num", "string", "regexp", "name" ]);

/* -----[ Parser ]----- */

function NodeWithToken(str, start, end) {
    this.name = str;
    this.start = start;
    this.end = end;
};

NodeWithToken.prototype.toString = function() { return this.name; };

function parse($TEXT, exigent_mode, embed_tokens) {

    var S = {
        input         : typeof $TEXT == "string" ? tokenizer($TEXT, true) : $TEXT,
        token         : null,
        prev          : null,
        peeked        : null,
        in_function   : 0,
        in_directives : true,
        in_loop       : 0,
        labels        : []
    };

    S.token = next();

    function is(type, value) {
        return is_token(S.token, type, value);
    };

    function peek() { return S.peeked || (S.peeked = S.input()); };

    function next() {
        S.prev = S.token;
        if (S.peeked) {
            S.token = S.peeked;
            S.peeked = null;
        } else {
            S.token = S.input();
        }
        S.in_directives = S.in_directives && (
            S.token.type == "string" || is("punc", ";")
        );
        return S.token;
    };

    function prev() {
        return S.prev;
    };

    function croak(msg, line, col, pos) {
        var ctx = S.input.context();
        js_error(msg,
                 line != null ? line : ctx.tokline,
                 col != null ? col : ctx.tokcol,
                 pos != null ? pos : ctx.tokpos);
    };

    function token_error(token, msg) {
        croak(msg, token.line, token.col);
    };

    function unexpected(token) {
        if (token == null)
            token = S.token;
        token_error(token, "Unexpected token: " + token.type + " (" + token.value + ")");
    };

    function expect_token(type, val) {
        if (is(type, val)) {
            return next();
        }
        token_error(S.token, "Unexpected token " + S.token.type + ", expected " + type);
    };

    function expect(punc) { return expect_token("punc", punc); };

    function can_insert_semicolon() {
        return !exigent_mode && (
            S.token.nlb || is("eof") || is("punc", "}")
        );
    };

    function semicolon() {
        if (is("punc", ";")) next();
        else if (!can_insert_semicolon()) unexpected();
    };

    function as() {
        return slice(arguments);
    };

    function parenthesised() {
        expect("(");
        var ex = expression();
        expect(")");
        return ex;
    };

    function add_tokens(str, start, end) {
        return str instanceof NodeWithToken ? str : new NodeWithToken(str, start, end);
    };

    function maybe_embed_tokens(parser) {
        if (embed_tokens) return function() {
            var start = S.token;
            var ast = parser.apply(this, arguments);
            ast[0] = add_tokens(ast[0], start, prev());
            return ast;
        };
        else return parser;
    };

    var statement = maybe_embed_tokens(function() {
        if (is("operator", "/") || is("operator", "/=")) {
            S.peeked = null;
            S.token = S.input(S.token.value.substr(1)); // force regexp
        }
        switch (S.token.type) {
          case "string":
            var dir = S.in_directives, stat = simple_statement();
            if (dir && stat[1][0] == "string" && !is("punc", ","))
                return as("directive", stat[1][1]);
            return stat;
          case "num":
          case "regexp":
          case "operator":
          case "atom":
            return simple_statement();

          case "name":
            return is_token(peek(), "punc", ":")
                ? labeled_statement(prog1(S.token.value, next, next))
                : simple_statement();

          case "punc":
            switch (S.token.value) {
              case "{":
                return as("block", block_());
              case "[":
              case "(":
                return simple_statement();
              case ";":
                next();
                return as("block");
              default:
                unexpected();
            }

          case "keyword":
            switch (prog1(S.token.value, next)) {
              case "break":
                return break_cont("break");

              case "continue":
                return break_cont("continue");

              case "debugger":
                semicolon();
                return as("debugger");

              case "do":
                return (function(body){
                    expect_token("keyword", "while");
                    return as("do", prog1(parenthesised, semicolon), body);
                })(in_loop(statement));

              case "for":
                return for_();

              case "function":
                return function_(true);

              case "if":
                return if_();

              case "return":
                if (S.in_function == 0)
                    croak("'return' outside of function");
                return as("return",
                          is("punc", ";")
                          ? (next(), null)
                          : can_insert_semicolon()
                          ? null
                          : prog1(expression, semicolon));

              case "switch":
                return as("switch", parenthesised(), switch_block_());

              case "throw":
                if (S.token.nlb)
                    croak("Illegal newline after 'throw'");
                return as("throw", prog1(expression, semicolon));

              case "try":
                return try_();

              case "var":
                return prog1(var_, semicolon);

              case "const":
                return prog1(const_, semicolon);

              case "while":
                return as("while", parenthesised(), in_loop(statement));

              case "with":
                return as("with", parenthesised(), statement());

              default:
                unexpected();
            }
        }
    });

    function labeled_statement(label) {
        S.labels.push(label);
        var start = S.token, stat = statement();
        if (exigent_mode && !HOP(STATEMENTS_WITH_LABELS, stat[0]))
            unexpected(start);
        S.labels.pop();
        return as("label", label, stat);
    };

    function simple_statement() {
        return as("stat", prog1(expression, semicolon));
    };

    function break_cont(type) {
        var name;
        if (!can_insert_semicolon()) {
            name = is("name") ? S.token.value : null;
        }
        if (name != null) {
            next();
            if (!member(name, S.labels))
                croak("Label " + name + " without matching loop or statement");
        }
        else if (S.in_loop == 0)
            croak(type + " not inside a loop or switch");
        semicolon();
        return as(type, name);
    };

    function for_() {
        expect("(");
        var init = null;
        if (!is("punc", ";")) {
            init = is("keyword", "var")
                ? (next(), var_(true))
                : expression(true, true);
            if (is("operator", "in")) {
                if (init[0] == "var" && init[1].length > 1)
                    croak("Only one variable declaration allowed in for..in loop");
                return for_in(init);
            }
        }
        return regular_for(init);
    };

    function regular_for(init) {
        expect(";");
        var test = is("punc", ";") ? null : expression();
        expect(";");
        var step = is("punc", ")") ? null : expression();
        expect(")");
        return as("for", init, test, step, in_loop(statement));
    };

    function for_in(init) {
        var lhs = init[0] == "var" ? as("name", init[1][0]) : init;
        next();
        var obj = expression();
        expect(")");
        return as("for-in", init, lhs, obj, in_loop(statement));
    };

    var function_ = function(in_statement) {
        var name = is("name") ? prog1(S.token.value, next) : null;
        if (in_statement && !name)
            unexpected();
        expect("(");
        return as(in_statement ? "defun" : "function",
                  name,
                  // arguments
                  (function(first, a){
                      while (!is("punc", ")")) {
                          if (first) first = false; else expect(",");
                          if (!is("name")) unexpected();
                          a.push(S.token.value);
                          next();
                      }
                      next();
                      return a;
                  })(true, []),
                  // body
                  (function(){
                      ++S.in_function;
                      var loop = S.in_loop;
                      S.in_directives = true;
                      S.in_loop = 0;
                      var a = block_();
                      --S.in_function;
                      S.in_loop = loop;
                      return a;
                  })());
    };

    function if_() {
        var cond = parenthesised(), body = statement(), belse;
        if (is("keyword", "else")) {
            next();
            belse = statement();
        }
        return as("if", cond, body, belse);
    };

    function block_() {
        expect("{");
        var a = [];
        while (!is("punc", "}")) {
            if (is("eof")) unexpected();
            a.push(statement());
        }
        next();
        return a;
    };

    var switch_block_ = curry(in_loop, function(){
        expect("{");
        var a = [], cur = null;
        while (!is("punc", "}")) {
            if (is("eof")) unexpected();
            if (is("keyword", "case")) {
                next();
                cur = [];
                a.push([ expression(), cur ]);
                expect(":");
            }
            else if (is("keyword", "default")) {
                next();
                expect(":");
                cur = [];
                a.push([ null, cur ]);
            }
            else {
                if (!cur) unexpected();
                cur.push(statement());
            }
        }
        next();
        return a;
    });

    function try_() {
        var body = block_(), bcatch, bfinally;
        if (is("keyword", "catch")) {
            next();
            expect("(");
            if (!is("name"))
                croak("Name expected");
            var name = S.token.value;
            next();
            expect(")");
            bcatch = [ name, block_() ];
        }
        if (is("keyword", "finally")) {
            next();
            bfinally = block_();
        }
        if (!bcatch && !bfinally)
            croak("Missing catch/finally blocks");
        return as("try", body, bcatch, bfinally);
    };

    function vardefs(no_in) {
        var a = [];
        for (;;) {
            if (!is("name"))
                unexpected();
            var name = S.token.value;
            next();
            if (is("operator", "=")) {
                next();
                a.push([ name, expression(false, no_in) ]);
            } else {
                a.push([ name ]);
            }
            if (!is("punc", ","))
                break;
            next();
        }
        return a;
    };

    function var_(no_in) {
        return as("var", vardefs(no_in));
    };

    function const_() {
        return as("const", vardefs());
    };

    function new_() {
        var newexp = expr_atom(false), args;
        if (is("punc", "(")) {
            next();
            args = expr_list(")");
        } else {
            args = [];
        }
        return subscripts(as("new", newexp, args), true);
    };

    var expr_atom = maybe_embed_tokens(function(allow_calls) {
        if (is("operator", "new")) {
            next();
            return new_();
        }
        if (is("punc")) {
            switch (S.token.value) {
              case "(":
                next();
                return subscripts(prog1(expression, curry(expect, ")")), allow_calls);
              case "[":
                next();
                return subscripts(array_(), allow_calls);
              case "{":
                next();
                return subscripts(object_(), allow_calls);
            }
            unexpected();
        }
        if (is("keyword", "function")) {
            next();
            return subscripts(function_(false), allow_calls);
        }
        if (HOP(ATOMIC_START_TOKEN, S.token.type)) {
            var atom = S.token.type == "regexp"
                ? as("regexp", S.token.value[0], S.token.value[1])
                : as(S.token.type, S.token.value);
            return subscripts(prog1(atom, next), allow_calls);
        }
        unexpected();
    });

    function expr_list(closing, allow_trailing_comma, allow_empty) {
        var first = true, a = [];
        while (!is("punc", closing)) {
            if (first) first = false; else expect(",");
            if (allow_trailing_comma && is("punc", closing)) break;
            if (is("punc", ",") && allow_empty) {
                a.push([ "atom", "undefined" ]);
            } else {
                a.push(expression(false));
            }
        }
        next();
        return a;
    };

    function array_() {
        return as("array", expr_list("]", !exigent_mode, true));
    };

    function object_() {
        var first = true, a = [];
        while (!is("punc", "}")) {
            if (first) first = false; else expect(",");
            if (!exigent_mode && is("punc", "}"))
                // allow trailing comma
                break;
            var type = S.token.type;
            var name = as_property_name();
            if (type == "name" && (name == "get" || name == "set") && !is("punc", ":")) {
                a.push([ as_name(), function_(false), name ]);
            } else {
                expect(":");
                a.push([ name, expression(false) ]);
            }
        }
        next();
        return as("object", a);
    };

    function as_property_name() {
        switch (S.token.type) {
          case "num":
          case "string":
            return prog1(S.token.value, next);
        }
        return as_name();
    };

    function as_name() {
        switch (S.token.type) {
          case "name":
          case "operator":
          case "keyword":
          case "atom":
            return prog1(S.token.value, next);
          default:
            unexpected();
        }
    };

    function subscripts(expr, allow_calls) {
        if (is("punc", ".")) {
            next();
            return subscripts(as("dot", expr, as_name()), allow_calls);
        }
        if (is("punc", "[")) {
            next();
            return subscripts(as("sub", expr, prog1(expression, curry(expect, "]"))), allow_calls);
        }
        if (allow_calls && is("punc", "(")) {
            next();
            return subscripts(as("call", expr, expr_list(")")), true);
        }
        return expr;
    };

    function maybe_unary(allow_calls) {
        if (is("operator") && HOP(UNARY_PREFIX, S.token.value)) {
            return make_unary("unary-prefix",
                              prog1(S.token.value, next),
                              maybe_unary(allow_calls));
        }
        var val = expr_atom(allow_calls);
        while (is("operator") && HOP(UNARY_POSTFIX, S.token.value) && !S.token.nlb) {
            val = make_unary("unary-postfix", S.token.value, val);
            next();
        }
        return val;
    };

    function make_unary(tag, op, expr) {
        if ((op == "++" || op == "--") && !is_assignable(expr))
            croak("Invalid use of " + op + " operator");
        return as(tag, op, expr);
    };

    function expr_op(left, min_prec, no_in) {
        var op = is("operator") ? S.token.value : null;
        if (op && op == "in" && no_in) op = null;
        var prec = op != null ? PRECEDENCE[op] : null;
        if (prec != null && prec > min_prec) {
            next();
            var right = expr_op(maybe_unary(true), prec, no_in);
            return expr_op(as("binary", op, left, right), min_prec, no_in);
        }
        return left;
    };

    function expr_ops(no_in) {
        return expr_op(maybe_unary(true), 0, no_in);
    };

    function maybe_conditional(no_in) {
        var expr = expr_ops(no_in);
        if (is("operator", "?")) {
            next();
            var yes = expression(false);
            expect(":");
            return as("conditional", expr, yes, expression(false, no_in));
        }
        return expr;
    };

    function is_assignable(expr) {
        if (!exigent_mode) return true;
        switch (expr[0]+"") {
          case "dot":
          case "sub":
          case "new":
          case "call":
            return true;
          case "name":
            return expr[1] != "this";
        }
    };

    function maybe_assign(no_in) {
        var left = maybe_conditional(no_in), val = S.token.value;
        if (is("operator") && HOP(ASSIGNMENT, val)) {
            if (is_assignable(left)) {
                next();
                return as("assign", ASSIGNMENT[val], left, maybe_assign(no_in));
            }
            croak("Invalid assignment");
        }
        return left;
    };

    var expression = maybe_embed_tokens(function(commas, no_in) {
        if (arguments.length == 0)
            commas = true;
        var expr = maybe_assign(no_in);
        if (commas && is("punc", ",")) {
            next();
            return as("seq", expr, expression(true, no_in));
        }
        return expr;
    });

    function in_loop(cont) {
        try {
            ++S.in_loop;
            return cont();
        } finally {
            --S.in_loop;
        }
    };

    return as("toplevel", (function(a){
        while (!is("eof"))
            a.push(statement());
        return a;
    })([]));

};

/* -----[ Utilities ]----- */

function curry(f) {
    var args = slice(arguments, 1);
    return function() { return f.apply(this, args.concat(slice(arguments))); };
};

function prog1(ret) {
    if (ret instanceof Function)
        ret = ret();
    for (var i = 1, n = arguments.length; --n > 0; ++i)
        arguments[i]();
    return ret;
};

function array_to_hash(a) {
    var ret = {};
    for (var i = 0; i < a.length; ++i)
        ret[a[i]] = true;
    return ret;
};

function slice(a, start) {
    return Array.prototype.slice.call(a, start || 0);
};

function characters(str) {
    return str.split("");
};

function member(name, array) {
    for (var i = array.length; --i >= 0;)
        if (array[i] == name)
            return true;
    return false;
};

function HOP(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};

var warn = function() {};

/* -----[ Exports ]----- */

exports.tokenizer = tokenizer;
exports.parse = parse;
exports.slice = slice;
exports.curry = curry;
exports.member = member;
exports.array_to_hash = array_to_hash;
exports.PRECEDENCE = PRECEDENCE;
exports.KEYWORDS_ATOM = KEYWORDS_ATOM;
exports.RESERVED_WORDS = RESERVED_WORDS;
exports.KEYWORDS = KEYWORDS;
exports.ATOMIC_START_TOKEN = ATOMIC_START_TOKEN;
exports.OPERATORS = OPERATORS;
exports.is_alphanumeric_char = is_alphanumeric_char;
exports.is_identifier_start = is_identifier_start;
exports.is_identifier_char = is_identifier_char;
exports.set_logger = function(logger) {
    warn = logger;
};

// Local variables:
// js-indent-level: 4
// End:

});

require.define("/node_modules/uglify-js/lib/process.js",function(require,module,exports,__dirname,__filename,process,global){/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.

  This version is suitable for Node.js.  With minimal changes (the
  exports stuff) it should work on any JS platform.

  This file implements some AST processors.  They work on data built
  by parse-js.

  Exported functions:

    - ast_mangle(ast, options) -- mangles the variable/function names
      in the AST.  Returns an AST.

    - ast_squeeze(ast) -- employs various optimizations to make the
      final generated code even smaller.  Returns an AST.

    - gen_code(ast, options) -- generates JS code from the AST.  Pass
      true (or an object, see the code for some options) as second
      argument to get "pretty" (indented) code.

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2010 (c) Mihai Bazon <mihai.bazon@gmail.com>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

var jsp = require("./parse-js"),
    curry = jsp.curry,
    slice = jsp.slice,
    member = jsp.member,
    is_identifier_char = jsp.is_identifier_char,
    PRECEDENCE = jsp.PRECEDENCE,
    OPERATORS = jsp.OPERATORS;

/* -----[ helper for AST traversal ]----- */

function ast_walker() {
    function _vardefs(defs) {
        return [ this[0], MAP(defs, function(def){
            var a = [ def[0] ];
            if (def.length > 1)
                a[1] = walk(def[1]);
            return a;
        }) ];
    };
    function _block(statements) {
        var out = [ this[0] ];
        if (statements != null)
            out.push(MAP(statements, walk));
        return out;
    };
    var walkers = {
        "string": function(str) {
            return [ this[0], str ];
        },
        "num": function(num) {
            return [ this[0], num ];
        },
        "name": function(name) {
            return [ this[0], name ];
        },
        "toplevel": function(statements) {
            return [ this[0], MAP(statements, walk) ];
        },
        "block": _block,
        "splice": _block,
        "var": _vardefs,
        "const": _vardefs,
        "try": function(t, c, f) {
            return [
                this[0],
                MAP(t, walk),
                c != null ? [ c[0], MAP(c[1], walk) ] : null,
                f != null ? MAP(f, walk) : null
            ];
        },
        "throw": function(expr) {
            return [ this[0], walk(expr) ];
        },
        "new": function(ctor, args) {
            return [ this[0], walk(ctor), MAP(args, walk) ];
        },
        "switch": function(expr, body) {
            return [ this[0], walk(expr), MAP(body, function(branch){
                return [ branch[0] ? walk(branch[0]) : null,
                         MAP(branch[1], walk) ];
            }) ];
        },
        "break": function(label) {
            return [ this[0], label ];
        },
        "continue": function(label) {
            return [ this[0], label ];
        },
        "conditional": function(cond, t, e) {
            return [ this[0], walk(cond), walk(t), walk(e) ];
        },
        "assign": function(op, lvalue, rvalue) {
            return [ this[0], op, walk(lvalue), walk(rvalue) ];
        },
        "dot": function(expr) {
            return [ this[0], walk(expr) ].concat(slice(arguments, 1));
        },
        "call": function(expr, args) {
            return [ this[0], walk(expr), MAP(args, walk) ];
        },
        "function": function(name, args, body) {
            return [ this[0], name, args.slice(), MAP(body, walk) ];
        },
        "debugger": function() {
            return [ this[0] ];
        },
        "defun": function(name, args, body) {
            return [ this[0], name, args.slice(), MAP(body, walk) ];
        },
        "if": function(conditional, t, e) {
            return [ this[0], walk(conditional), walk(t), walk(e) ];
        },
        "for": function(init, cond, step, block) {
            return [ this[0], walk(init), walk(cond), walk(step), walk(block) ];
        },
        "for-in": function(vvar, key, hash, block) {
            return [ this[0], walk(vvar), walk(key), walk(hash), walk(block) ];
        },
        "while": function(cond, block) {
            return [ this[0], walk(cond), walk(block) ];
        },
        "do": function(cond, block) {
            return [ this[0], walk(cond), walk(block) ];
        },
        "return": function(expr) {
            return [ this[0], walk(expr) ];
        },
        "binary": function(op, left, right) {
            return [ this[0], op, walk(left), walk(right) ];
        },
        "unary-prefix": function(op, expr) {
            return [ this[0], op, walk(expr) ];
        },
        "unary-postfix": function(op, expr) {
            return [ this[0], op, walk(expr) ];
        },
        "sub": function(expr, subscript) {
            return [ this[0], walk(expr), walk(subscript) ];
        },
        "object": function(props) {
            return [ this[0], MAP(props, function(p){
                return p.length == 2
                    ? [ p[0], walk(p[1]) ]
                    : [ p[0], walk(p[1]), p[2] ]; // get/set-ter
            }) ];
        },
        "regexp": function(rx, mods) {
            return [ this[0], rx, mods ];
        },
        "array": function(elements) {
            return [ this[0], MAP(elements, walk) ];
        },
        "stat": function(stat) {
            return [ this[0], walk(stat) ];
        },
        "seq": function() {
            return [ this[0] ].concat(MAP(slice(arguments), walk));
        },
        "label": function(name, block) {
            return [ this[0], name, walk(block) ];
        },
        "with": function(expr, block) {
            return [ this[0], walk(expr), walk(block) ];
        },
        "atom": function(name) {
            return [ this[0], name ];
        },
        "directive": function(dir) {
            return [ this[0], dir ];
        }
    };

    var user = {};
    var stack = [];
    function walk(ast) {
        if (ast == null)
            return null;
        try {
            stack.push(ast);
            var type = ast[0];
            var gen = user[type];
            if (gen) {
                var ret = gen.apply(ast, ast.slice(1));
                if (ret != null)
                    return ret;
            }
            gen = walkers[type];
            return gen.apply(ast, ast.slice(1));
        } finally {
            stack.pop();
        }
    };

    function dive(ast) {
        if (ast == null)
            return null;
        try {
            stack.push(ast);
            return walkers[ast[0]].apply(ast, ast.slice(1));
        } finally {
            stack.pop();
        }
    };

    function with_walkers(walkers, cont){
        var save = {}, i;
        for (i in walkers) if (HOP(walkers, i)) {
            save[i] = user[i];
            user[i] = walkers[i];
        }
        var ret = cont();
        for (i in save) if (HOP(save, i)) {
            if (!save[i]) delete user[i];
            else user[i] = save[i];
        }
        return ret;
    };

    return {
        walk: walk,
        dive: dive,
        with_walkers: with_walkers,
        parent: function() {
            return stack[stack.length - 2]; // last one is current node
        },
        stack: function() {
            return stack;
        }
    };
};

/* -----[ Scope and mangling ]----- */

function Scope(parent) {
    this.names = {};        // names defined in this scope
    this.mangled = {};      // mangled names (orig.name => mangled)
    this.rev_mangled = {};  // reverse lookup (mangled => orig.name)
    this.cname = -1;        // current mangled name
    this.refs = {};         // names referenced from this scope
    this.uses_with = false; // will become TRUE if with() is detected in this or any subscopes
    this.uses_eval = false; // will become TRUE if eval() is detected in this or any subscopes
    this.directives = [];   // directives activated from this scope
    this.parent = parent;   // parent scope
    this.children = [];     // sub-scopes
    if (parent) {
        this.level = parent.level + 1;
        parent.children.push(this);
    } else {
        this.level = 0;
    }
};

function base54_digits() {
    if (typeof DIGITS_OVERRIDE_FOR_TESTING != "undefined")
        return DIGITS_OVERRIDE_FOR_TESTING;
    else
        return "etnrisouaflchpdvmgybwESxTNCkLAOM_DPHBjFIqRUzWXV$JKQGYZ0516372984";
}

var base54 = (function(){
    var DIGITS = base54_digits();
    return function(num) {
        var ret = "", base = 54;
        do {
            ret += DIGITS.charAt(num % base);
            num = Math.floor(num / base);
            base = 64;
        } while (num > 0);
        return ret;
    };
})();

Scope.prototype = {
    has: function(name) {
        for (var s = this; s; s = s.parent)
            if (HOP(s.names, name))
                return s;
    },
    has_mangled: function(mname) {
        for (var s = this; s; s = s.parent)
            if (HOP(s.rev_mangled, mname))
                return s;
    },
    toJSON: function() {
        return {
            names: this.names,
            uses_eval: this.uses_eval,
            uses_with: this.uses_with
        };
    },

    next_mangled: function() {
        // we must be careful that the new mangled name:
        //
        // 1. doesn't shadow a mangled name from a parent
        //    scope, unless we don't reference the original
        //    name from this scope OR from any sub-scopes!
        //    This will get slow.
        //
        // 2. doesn't shadow an original name from a parent
        //    scope, in the event that the name is not mangled
        //    in the parent scope and we reference that name
        //    here OR IN ANY SUBSCOPES!
        //
        // 3. doesn't shadow a name that is referenced but not
        //    defined (possibly global defined elsewhere).
        for (;;) {
            var m = base54(++this.cname), prior;

            // case 1.
            prior = this.has_mangled(m);
            if (prior && this.refs[prior.rev_mangled[m]] === prior)
                continue;

            // case 2.
            prior = this.has(m);
            if (prior && prior !== this && this.refs[m] === prior && !prior.has_mangled(m))
                continue;

            // case 3.
            if (HOP(this.refs, m) && this.refs[m] == null)
                continue;

            // I got "do" once. :-/
            if (!is_identifier(m))
                continue;

            return m;
        }
    },
    set_mangle: function(name, m) {
        this.rev_mangled[m] = name;
        return this.mangled[name] = m;
    },
    get_mangled: function(name, newMangle) {
        if (this.uses_eval || this.uses_with) return name; // no mangle if eval or with is in use
        var s = this.has(name);
        if (!s) return name; // not in visible scope, no mangle
        if (HOP(s.mangled, name)) return s.mangled[name]; // already mangled in this scope
        if (!newMangle) return name;                      // not found and no mangling requested
        return s.set_mangle(name, s.next_mangled());
    },
    references: function(name) {
        return name && !this.parent || this.uses_with || this.uses_eval || this.refs[name];
    },
    define: function(name, type) {
        if (name != null) {
            if (type == "var" || !HOP(this.names, name))
                this.names[name] = type || "var";
            return name;
        }
    },
    active_directive: function(dir) {
        return member(dir, this.directives) || this.parent && this.parent.active_directive(dir);
    }
};

function ast_add_scope(ast) {

    var current_scope = null;
    var w = ast_walker(), walk = w.walk;
    var having_eval = [];

    function with_new_scope(cont) {
        current_scope = new Scope(current_scope);
        current_scope.labels = new Scope();
        var ret = current_scope.body = cont();
        ret.scope = current_scope;
        current_scope = current_scope.parent;
        return ret;
    };

    function define(name, type) {
        return current_scope.define(name, type);
    };

    function reference(name) {
        current_scope.refs[name] = true;
    };

    function _lambda(name, args, body) {
        var is_defun = this[0] == "defun";
        return [ this[0], is_defun ? define(name, "defun") : name, args, with_new_scope(function(){
            if (!is_defun) define(name, "lambda");
            MAP(args, function(name){ define(name, "arg") });
            return MAP(body, walk);
        })];
    };

    function _vardefs(type) {
        return function(defs) {
            MAP(defs, function(d){
                define(d[0], type);
                if (d[1]) reference(d[0]);
            });
        };
    };

    function _breacont(label) {
        if (label)
            current_scope.labels.refs[label] = true;
    };

    return with_new_scope(function(){
        // process AST
        var ret = w.with_walkers({
            "function": _lambda,
            "defun": _lambda,
            "label": function(name, stat) { current_scope.labels.define(name) },
            "break": _breacont,
            "continue": _breacont,
            "with": function(expr, block) {
                for (var s = current_scope; s; s = s.parent)
                    s.uses_with = true;
            },
            "var": _vardefs("var"),
            "const": _vardefs("const"),
            "try": function(t, c, f) {
                if (c != null) return [
                    this[0],
                    MAP(t, walk),
                    [ define(c[0], "catch"), MAP(c[1], walk) ],
                    f != null ? MAP(f, walk) : null
                ];
            },
            "name": function(name) {
                if (name == "eval")
                    having_eval.push(current_scope);
                reference(name);
            }
        }, function(){
            return walk(ast);
        });

        // the reason why we need an additional pass here is
        // that names can be used prior to their definition.

        // scopes where eval was detected and their parents
        // are marked with uses_eval, unless they define the
        // "eval" name.
        MAP(having_eval, function(scope){
            if (!scope.has("eval")) while (scope) {
                scope.uses_eval = true;
                scope = scope.parent;
            }
        });

        // for referenced names it might be useful to know
        // their origin scope.  current_scope here is the
        // toplevel one.
        function fixrefs(scope, i) {
            // do children first; order shouldn't matter
            for (i = scope.children.length; --i >= 0;)
                fixrefs(scope.children[i]);
            for (i in scope.refs) if (HOP(scope.refs, i)) {
                // find origin scope and propagate the reference to origin
                for (var origin = scope.has(i), s = scope; s; s = s.parent) {
                    s.refs[i] = origin;
                    if (s === origin) break;
                }
            }
        };
        fixrefs(current_scope);

        return ret;
    });

};

/* -----[ mangle names ]----- */

function ast_mangle(ast, options) {
    var w = ast_walker(), walk = w.walk, scope;
    options = defaults(options, {
        mangle       : true,
        toplevel     : false,
        defines      : null,
        except       : null,
        no_functions : false
    });

    function get_mangled(name, newMangle) {
        if (!options.mangle) return name;
        if (!options.toplevel && !scope.parent) return name; // don't mangle toplevel
        if (options.except && member(name, options.except))
            return name;
        if (options.no_functions && HOP(scope.names, name) &&
            (scope.names[name] == 'defun' || scope.names[name] == 'lambda'))
            return name;
        return scope.get_mangled(name, newMangle);
    };

    function get_define(name) {
        if (options.defines) {
            // we always lookup a defined symbol for the current scope FIRST, so declared
            // vars trump a DEFINE symbol, but if no such var is found, then match a DEFINE value
            if (!scope.has(name)) {
                if (HOP(options.defines, name)) {
                    return options.defines[name];
                }
            }
            return null;
        }
    };

    function _lambda(name, args, body) {
        if (!options.no_functions && options.mangle) {
            var is_defun = this[0] == "defun", extra;
            if (name) {
                if (is_defun) name = get_mangled(name);
                else if (body.scope.references(name)) {
                    extra = {};
                    if (!(scope.uses_eval || scope.uses_with))
                        name = extra[name] = scope.next_mangled();
                    else
                        extra[name] = name;
                }
                else name = null;
            }
        }
        body = with_scope(body.scope, function(){
            args = MAP(args, function(name){ return get_mangled(name) });
            return MAP(body, walk);
        }, extra);
        return [ this[0], name, args, body ];
    };

    function with_scope(s, cont, extra) {
        var _scope = scope;
        scope = s;
        if (extra) for (var i in extra) if (HOP(extra, i)) {
            s.set_mangle(i, extra[i]);
        }
        for (var i in s.names) if (HOP(s.names, i)) {
            get_mangled(i, true);
        }
        var ret = cont();
        ret.scope = s;
        scope = _scope;
        return ret;
    };

    function _vardefs(defs) {
        return [ this[0], MAP(defs, function(d){
            return [ get_mangled(d[0]), walk(d[1]) ];
        }) ];
    };

    function _breacont(label) {
        if (label) return [ this[0], scope.labels.get_mangled(label) ];
    };

    return w.with_walkers({
        "function": _lambda,
        "defun": function() {
            // move function declarations to the top when
            // they are not in some block.
            var ast = _lambda.apply(this, arguments);
            switch (w.parent()[0]) {
              case "toplevel":
              case "function":
              case "defun":
                return MAP.at_top(ast);
            }
            return ast;
        },
        "label": function(label, stat) {
            if (scope.labels.refs[label]) return [
                this[0],
                scope.labels.get_mangled(label, true),
                walk(stat)
            ];
            return walk(stat);
        },
        "break": _breacont,
        "continue": _breacont,
        "var": _vardefs,
        "const": _vardefs,
        "name": function(name) {
            return get_define(name) || [ this[0], get_mangled(name) ];
        },
        "try": function(t, c, f) {
            return [ this[0],
                     MAP(t, walk),
                     c != null ? [ get_mangled(c[0]), MAP(c[1], walk) ] : null,
                     f != null ? MAP(f, walk) : null ];
        },
        "toplevel": function(body) {
            var self = this;
            return with_scope(self.scope, function(){
                return [ self[0], MAP(body, walk) ];
            });
        },
        "directive": function() {
            return MAP.at_top(this);
        }
    }, function() {
        return walk(ast_add_scope(ast));
    });
};

/* -----[
   - compress foo["bar"] into foo.bar,
   - remove block brackets {} where possible
   - join consecutive var declarations
   - various optimizations for IFs:
   - if (cond) foo(); else bar();  ==>  cond?foo():bar();
   - if (cond) foo();  ==>  cond&&foo();
   - if (foo) return bar(); else return baz();  ==> return foo?bar():baz(); // also for throw
   - if (foo) return bar(); else something();  ==> {if(foo)return bar();something()}
   ]----- */

var warn = function(){};

function best_of(ast1, ast2) {
    return gen_code(ast1).length > gen_code(ast2[0] == "stat" ? ast2[1] : ast2).length ? ast2 : ast1;
};

function last_stat(b) {
    if (b[0] == "block" && b[1] && b[1].length > 0)
        return b[1][b[1].length - 1];
    return b;
}

function aborts(t) {
    if (t) switch (last_stat(t)[0]) {
      case "return":
      case "break":
      case "continue":
      case "throw":
        return true;
    }
};

function boolean_expr(expr) {
    return ( (expr[0] == "unary-prefix"
              && member(expr[1], [ "!", "delete" ])) ||

             (expr[0] == "binary"
              && member(expr[1], [ "in", "instanceof", "==", "!=", "===", "!==", "<", "<=", ">=", ">" ])) ||

             (expr[0] == "binary"
              && member(expr[1], [ "&&", "||" ])
              && boolean_expr(expr[2])
              && boolean_expr(expr[3])) ||

             (expr[0] == "conditional"
              && boolean_expr(expr[2])
              && boolean_expr(expr[3])) ||

             (expr[0] == "assign"
              && expr[1] === true
              && boolean_expr(expr[3])) ||

             (expr[0] == "seq"
              && boolean_expr(expr[expr.length - 1]))
           );
};

function empty(b) {
    return !b || (b[0] == "block" && (!b[1] || b[1].length == 0));
};

function is_string(node) {
    return (node[0] == "string" ||
            node[0] == "unary-prefix" && node[1] == "typeof" ||
            node[0] == "binary" && node[1] == "+" &&
            (is_string(node[2]) || is_string(node[3])));
};

var when_constant = (function(){

    var $NOT_CONSTANT = {};

    // this can only evaluate constant expressions.  If it finds anything
    // not constant, it throws $NOT_CONSTANT.
    function evaluate(expr) {
        switch (expr[0]) {
          case "string":
          case "num":
            return expr[1];
          case "name":
          case "atom":
            switch (expr[1]) {
              case "true": return true;
              case "false": return false;
              case "null": return null;
            }
            break;
          case "unary-prefix":
            switch (expr[1]) {
              case "!": return !evaluate(expr[2]);
              case "typeof": return typeof evaluate(expr[2]);
              case "~": return ~evaluate(expr[2]);
              case "-": return -evaluate(expr[2]);
              case "+": return +evaluate(expr[2]);
            }
            break;
          case "binary":
            var left = expr[2], right = expr[3];
            switch (expr[1]) {
              case "&&"         : return evaluate(left) &&         evaluate(right);
              case "||"         : return evaluate(left) ||         evaluate(right);
              case "|"          : return evaluate(left) |          evaluate(right);
              case "&"          : return evaluate(left) &          evaluate(right);
              case "^"          : return evaluate(left) ^          evaluate(right);
              case "+"          : return evaluate(left) +          evaluate(right);
              case "*"          : return evaluate(left) *          evaluate(right);
              case "/"          : return evaluate(left) /          evaluate(right);
              case "%"          : return evaluate(left) %          evaluate(right);
              case "-"          : return evaluate(left) -          evaluate(right);
              case "<<"         : return evaluate(left) <<         evaluate(right);
              case ">>"         : return evaluate(left) >>         evaluate(right);
              case ">>>"        : return evaluate(left) >>>        evaluate(right);
              case "=="         : return evaluate(left) ==         evaluate(right);
              case "==="        : return evaluate(left) ===        evaluate(right);
              case "!="         : return evaluate(left) !=         evaluate(right);
              case "!=="        : return evaluate(left) !==        evaluate(right);
              case "<"          : return evaluate(left) <          evaluate(right);
              case "<="         : return evaluate(left) <=         evaluate(right);
              case ">"          : return evaluate(left) >          evaluate(right);
              case ">="         : return evaluate(left) >=         evaluate(right);
              case "in"         : return evaluate(left) in         evaluate(right);
              case "instanceof" : return evaluate(left) instanceof evaluate(right);
            }
        }
        throw $NOT_CONSTANT;
    };

    return function(expr, yes, no) {
        try {
            var val = evaluate(expr), ast;
            switch (typeof val) {
              case "string": ast =  [ "string", val ]; break;
              case "number": ast =  [ "num", val ]; break;
              case "boolean": ast =  [ "name", String(val) ]; break;
              default:
                if (val === null) { ast = [ "atom", "null" ]; break; }
                throw new Error("Can't handle constant of type: " + (typeof val));
            }
            return yes.call(expr, ast, val);
        } catch(ex) {
            if (ex === $NOT_CONSTANT) {
                if (expr[0] == "binary"
                    && (expr[1] == "===" || expr[1] == "!==")
                    && ((is_string(expr[2]) && is_string(expr[3]))
                        || (boolean_expr(expr[2]) && boolean_expr(expr[3])))) {
                    expr[1] = expr[1].substr(0, 2);
                }
                else if (no && expr[0] == "binary"
                         && (expr[1] == "||" || expr[1] == "&&")) {
                    // the whole expression is not constant but the lval may be...
                    try {
                        var lval = evaluate(expr[2]);
                        expr = ((expr[1] == "&&" && (lval ? expr[3] : lval))    ||
                                (expr[1] == "||" && (lval ? lval    : expr[3])) ||
                                expr);
                    } catch(ex2) {
                        // IGNORE... lval is not constant
                    }
                }
                return no ? no.call(expr, expr) : null;
            }
            else throw ex;
        }
    };

})();

function warn_unreachable(ast) {
    if (!empty(ast))
        warn("Dropping unreachable code: " + gen_code(ast, true));
};

function prepare_ifs(ast) {
    var w = ast_walker(), walk = w.walk;
    // In this first pass, we rewrite ifs which abort with no else with an
    // if-else.  For example:
    //
    // if (x) {
    //     blah();
    //     return y;
    // }
    // foobar();
    //
    // is rewritten into:
    //
    // if (x) {
    //     blah();
    //     return y;
    // } else {
    //     foobar();
    // }
    function redo_if(statements) {
        statements = MAP(statements, walk);

        for (var i = 0; i < statements.length; ++i) {
            var fi = statements[i];
            if (fi[0] != "if") continue;

            if (fi[3]) continue;

            var t = fi[2];
            if (!aborts(t)) continue;

            var conditional = walk(fi[1]);

            var e_body = redo_if(statements.slice(i + 1));
            var e = e_body.length == 1 ? e_body[0] : [ "block", e_body ];

            return statements.slice(0, i).concat([ [
                fi[0],          // "if"
                conditional,    // conditional
                t,              // then
                e               // else
            ] ]);
        }

        return statements;
    };

    function redo_if_lambda(name, args, body) {
        body = redo_if(body);
        return [ this[0], name, args, body ];
    };

    function redo_if_block(statements) {
        return [ this[0], statements != null ? redo_if(statements) : null ];
    };

    return w.with_walkers({
        "defun": redo_if_lambda,
        "function": redo_if_lambda,
        "block": redo_if_block,
        "splice": redo_if_block,
        "toplevel": function(statements) {
            return [ this[0], redo_if(statements) ];
        },
        "try": function(t, c, f) {
            return [
                this[0],
                redo_if(t),
                c != null ? [ c[0], redo_if(c[1]) ] : null,
                f != null ? redo_if(f) : null
            ];
        }
    }, function() {
        return walk(ast);
    });
};

function for_side_effects(ast, handler) {
    var w = ast_walker(), walk = w.walk;
    var $stop = {}, $restart = {};
    function stop() { throw $stop };
    function restart() { throw $restart };
    function found(){ return handler.call(this, this, w, stop, restart) };
    function unary(op) {
        if (op == "++" || op == "--")
            return found.apply(this, arguments);
    };
    function binary(op) {
        if (op == "&&" || op == "||")
            return found.apply(this, arguments);
    };
    return w.with_walkers({
        "try": found,
        "throw": found,
        "return": found,
        "new": found,
        "switch": found,
        "break": found,
        "continue": found,
        "assign": found,
        "call": found,
        "if": found,
        "for": found,
        "for-in": found,
        "while": found,
        "do": found,
        "return": found,
        "unary-prefix": unary,
        "unary-postfix": unary,
        "conditional": found,
        "binary": binary,
        "defun": found
    }, function(){
        while (true) try {
            walk(ast);
            break;
        } catch(ex) {
            if (ex === $stop) break;
            if (ex === $restart) continue;
            throw ex;
        }
    });
};

function ast_lift_variables(ast) {
    var w = ast_walker(), walk = w.walk, scope;
    function do_body(body, env) {
        var _scope = scope;
        scope = env;
        body = MAP(body, walk);
        var hash = {}, names = MAP(env.names, function(type, name){
            if (type != "var") return MAP.skip;
            if (!env.references(name)) return MAP.skip;
            hash[name] = true;
            return [ name ];
        });
        if (names.length > 0) {
            // looking for assignments to any of these variables.
            // we can save considerable space by moving the definitions
            // in the var declaration.
            for_side_effects([ "block", body ], function(ast, walker, stop, restart) {
                if (ast[0] == "assign"
                    && ast[1] === true
                    && ast[2][0] == "name"
                    && HOP(hash, ast[2][1])) {
                    // insert the definition into the var declaration
                    for (var i = names.length; --i >= 0;) {
                        if (names[i][0] == ast[2][1]) {
                            if (names[i][1]) // this name already defined, we must stop
                                stop();
                            names[i][1] = ast[3]; // definition
                            names.push(names.splice(i, 1)[0]);
                            break;
                        }
                    }
                    // remove this assignment from the AST.
                    var p = walker.parent();
                    if (p[0] == "seq") {
                        var a = p[2];
                        a.unshift(0, p.length);
                        p.splice.apply(p, a);
                    }
                    else if (p[0] == "stat") {
                        p.splice(0, p.length, "block"); // empty statement
                    }
                    else {
                        stop();
                    }
                    restart();
                }
                stop();
            });
            body.unshift([ "var", names ]);
        }
        scope = _scope;
        return body;
    };
    function _vardefs(defs) {
        var ret = null;
        for (var i = defs.length; --i >= 0;) {
            var d = defs[i];
            if (!d[1]) continue;
            d = [ "assign", true, [ "name", d[0] ], d[1] ];
            if (ret == null) ret = d;
            else ret = [ "seq", d, ret ];
        }
        if (ret == null && w.parent()[0] != "for") {
            if (w.parent()[0] == "for-in")
                return [ "name", defs[0][0] ];
            return MAP.skip;
        }
        return [ "stat", ret ];
    };
    function _toplevel(body) {
        return [ this[0], do_body(body, this.scope) ];
    };
    return w.with_walkers({
        "function": function(name, args, body){
            for (var i = args.length; --i >= 0 && !body.scope.references(args[i]);)
                args.pop();
            if (!body.scope.references(name)) name = null;
            return [ this[0], name, args, do_body(body, body.scope) ];
        },
        "defun": function(name, args, body){
            if (!scope.references(name)) return MAP.skip;
            for (var i = args.length; --i >= 0 && !body.scope.references(args[i]);)
                args.pop();
            return [ this[0], name, args, do_body(body, body.scope) ];
        },
        "var": _vardefs,
        "toplevel": _toplevel
    }, function(){
        return walk(ast_add_scope(ast));
    });
};

function ast_squeeze(ast, options) {
    ast = squeeze_1(ast, options);
    ast = squeeze_2(ast, options);
    return ast;
};

function squeeze_1(ast, options) {
    options = defaults(options, {
        make_seqs   : true,
        dead_code   : true,
        no_warnings : false,
        keep_comps  : true,
        unsafe      : false
    });

    var w = ast_walker(), walk = w.walk, scope;

    function negate(c) {
        var not_c = [ "unary-prefix", "!", c ];
        switch (c[0]) {
          case "unary-prefix":
            return c[1] == "!" && boolean_expr(c[2]) ? c[2] : not_c;
          case "seq":
            c = slice(c);
            c[c.length - 1] = negate(c[c.length - 1]);
            return c;
          case "conditional":
            return best_of(not_c, [ "conditional", c[1], negate(c[2]), negate(c[3]) ]);
          case "binary":
            var op = c[1], left = c[2], right = c[3];
            if (!options.keep_comps) switch (op) {
              case "<="  : return [ "binary", ">", left, right ];
              case "<"   : return [ "binary", ">=", left, right ];
              case ">="  : return [ "binary", "<", left, right ];
              case ">"   : return [ "binary", "<=", left, right ];
            }
            switch (op) {
              case "=="  : return [ "binary", "!=", left, right ];
              case "!="  : return [ "binary", "==", left, right ];
              case "===" : return [ "binary", "!==", left, right ];
              case "!==" : return [ "binary", "===", left, right ];
              case "&&"  : return best_of(not_c, [ "binary", "||", negate(left), negate(right) ]);
              case "||"  : return best_of(not_c, [ "binary", "&&", negate(left), negate(right) ]);
            }
            break;
        }
        return not_c;
    };

    function make_conditional(c, t, e) {
        var make_real_conditional = function() {
            if (c[0] == "unary-prefix" && c[1] == "!") {
                return e ? [ "conditional", c[2], e, t ] : [ "binary", "||", c[2], t ];
            } else {
                return e ? best_of(
                    [ "conditional", c, t, e ],
                    [ "conditional", negate(c), e, t ]
                ) : [ "binary", "&&", c, t ];
            }
        };
        // shortcut the conditional if the expression has a constant value
        return when_constant(c, function(ast, val){
            warn_unreachable(val ? e : t);
            return          (val ? t : e);
        }, make_real_conditional);
    };

    function rmblock(block) {
        if (block != null && block[0] == "block" && block[1]) {
            if (block[1].length == 1)
                block = block[1][0];
            else if (block[1].length == 0)
                block = [ "block" ];
        }
        return block;
    };

    function _lambda(name, args, body) {
        return [ this[0], name, args, tighten(body, "lambda") ];
    };

    // this function does a few things:
    // 1. discard useless blocks
    // 2. join consecutive var declarations
    // 3. remove obviously dead code
    // 4. transform consecutive statements using the comma operator
    // 5. if block_type == "lambda" and it detects constructs like if(foo) return ... - rewrite like if (!foo) { ... }
    function tighten(statements, block_type) {
        statements = MAP(statements, walk);

        statements = statements.reduce(function(a, stat){
            if (stat[0] == "block") {
                if (stat[1]) {
                    a.push.apply(a, stat[1]);
                }
            } else {
                a.push(stat);
            }
            return a;
        }, []);

        statements = (function(a, prev){
            statements.forEach(function(cur){
                if (prev && ((cur[0] == "var" && prev[0] == "var") ||
                             (cur[0] == "const" && prev[0] == "const"))) {
                    prev[1] = prev[1].concat(cur[1]);
                } else {
                    a.push(cur);
                    prev = cur;
                }
            });
            return a;
        })([]);

        if (options.dead_code) statements = (function(a, has_quit){
            statements.forEach(function(st){
                if (has_quit) {
                    if (st[0] == "function" || st[0] == "defun") {
                        a.push(st);
                    }
                    else if (st[0] == "var" || st[0] == "const") {
                        if (!options.no_warnings)
                            warn("Variables declared in unreachable code");
                        st[1] = MAP(st[1], function(def){
                            if (def[1] && !options.no_warnings)
                                warn_unreachable([ "assign", true, [ "name", def[0] ], def[1] ]);
                            return [ def[0] ];
                        });
                        a.push(st);
                    }
                    else if (!options.no_warnings)
                        warn_unreachable(st);
                }
                else {
                    a.push(st);
                    if (member(st[0], [ "return", "throw", "break", "continue" ]))
                        has_quit = true;
                }
            });
            return a;
        })([]);

        if (options.make_seqs) statements = (function(a, prev) {
            statements.forEach(function(cur){
                if (prev && prev[0] == "stat" && cur[0] == "stat") {
                    prev[1] = [ "seq", prev[1], cur[1] ];
                } else {
                    a.push(cur);
                    prev = cur;
                }
            });
            if (a.length >= 2
                && a[a.length-2][0] == "stat"
                && (a[a.length-1][0] == "return" || a[a.length-1][0] == "throw")
                && a[a.length-1][1])
            {
                a.splice(a.length - 2, 2,
                         [ a[a.length-1][0],
                           [ "seq", a[a.length-2][1], a[a.length-1][1] ]]);
            }
            return a;
        })([]);

        // this increases jQuery by 1K.  Probably not such a good idea after all..
        // part of this is done in prepare_ifs anyway.
        // if (block_type == "lambda") statements = (function(i, a, stat){
        //         while (i < statements.length) {
        //                 stat = statements[i++];
        //                 if (stat[0] == "if" && !stat[3]) {
        //                         if (stat[2][0] == "return" && stat[2][1] == null) {
        //                                 a.push(make_if(negate(stat[1]), [ "block", statements.slice(i) ]));
        //                                 break;
        //                         }
        //                         var last = last_stat(stat[2]);
        //                         if (last[0] == "return" && last[1] == null) {
        //                                 a.push(make_if(stat[1], [ "block", stat[2][1].slice(0, -1) ], [ "block", statements.slice(i) ]));
        //                                 break;
        //                         }
        //                 }
        //                 a.push(stat);
        //         }
        //         return a;
        // })(0, []);

        return statements;
    };

    function make_if(c, t, e) {
        return when_constant(c, function(ast, val){
            if (val) {
                t = walk(t);
                warn_unreachable(e);
                return t || [ "block" ];
            } else {
                e = walk(e);
                warn_unreachable(t);
                return e || [ "block" ];
            }
        }, function() {
            return make_real_if(c, t, e);
        });
    };

    function abort_else(c, t, e) {
        var ret = [ [ "if", negate(c), e ] ];
        if (t[0] == "block") {
            if (t[1]) ret = ret.concat(t[1]);
        } else {
            ret.push(t);
        }
        return walk([ "block", ret ]);
    };

    function make_real_if(c, t, e) {
        c = walk(c);
        t = walk(t);
        e = walk(e);

        if (empty(e) && empty(t))
            return [ "stat", c ];

        if (empty(t)) {
            c = negate(c);
            t = e;
            e = null;
        } else if (empty(e)) {
            e = null;
        } else {
            // if we have both else and then, maybe it makes sense to switch them?
            (function(){
                var a = gen_code(c);
                var n = negate(c);
                var b = gen_code(n);
                if (b.length < a.length) {
                    var tmp = t;
                    t = e;
                    e = tmp;
                    c = n;
                }
            })();
        }
        var ret = [ "if", c, t, e ];
        if (t[0] == "if" && empty(t[3]) && empty(e)) {
            ret = best_of(ret, walk([ "if", [ "binary", "&&", c, t[1] ], t[2] ]));
        }
        else if (t[0] == "stat") {
            if (e) {
                if (e[0] == "stat")
                    ret = best_of(ret, [ "stat", make_conditional(c, t[1], e[1]) ]);
                else if (aborts(e))
                    ret = abort_else(c, t, e);
            }
            else {
                ret = best_of(ret, [ "stat", make_conditional(c, t[1]) ]);
            }
        }
        else if (e && t[0] == e[0] && (t[0] == "return" || t[0] == "throw") && t[1] && e[1]) {
            ret = best_of(ret, [ t[0], make_conditional(c, t[1], e[1] ) ]);
        }
        else if (e && aborts(t)) {
            ret = [ [ "if", c, t ] ];
            if (e[0] == "block") {
                if (e[1]) ret = ret.concat(e[1]);
            }
            else {
                ret.push(e);
            }
            ret = walk([ "block", ret ]);
        }
        else if (t && aborts(e)) {
            ret = abort_else(c, t, e);
        }
        return ret;
    };

    function _do_while(cond, body) {
        return when_constant(cond, function(cond, val){
            if (!val) {
                warn_unreachable(body);
                return [ "block" ];
            } else {
                return [ "for", null, null, null, walk(body) ];
            }
        });
    };

    return w.with_walkers({
        "sub": function(expr, subscript) {
            if (subscript[0] == "string") {
                var name = subscript[1];
                if (is_identifier(name))
                    return [ "dot", walk(expr), name ];
                else if (/^[1-9][0-9]*$/.test(name) || name === "0")
                    return [ "sub", walk(expr), [ "num", parseInt(name, 10) ] ];
            }
        },
        "if": make_if,
        "toplevel": function(body) {
            return [ "toplevel", tighten(body) ];
        },
        "switch": function(expr, body) {
            var last = body.length - 1;
            return [ "switch", walk(expr), MAP(body, function(branch, i){
                var block = tighten(branch[1]);
                if (i == last && block.length > 0) {
                    var node = block[block.length - 1];
                    if (node[0] == "break" && !node[1])
                        block.pop();
                }
                return [ branch[0] ? walk(branch[0]) : null, block ];
            }) ];
        },
        "function": _lambda,
        "defun": _lambda,
        "block": function(body) {
            if (body) return rmblock([ "block", tighten(body) ]);
        },
        "binary": function(op, left, right) {
            return when_constant([ "binary", op, walk(left), walk(right) ], function yes(c){
                return best_of(walk(c), this);
            }, function no() {
                return function(){
                    if(op != "==" && op != "!=") return;
                    var l = walk(left), r = walk(right);
                    if(l && l[0] == "unary-prefix" && l[1] == "!" && l[2][0] == "num")
                        left = ['num', +!l[2][1]];
                    else if (r && r[0] == "unary-prefix" && r[1] == "!" && r[2][0] == "num")
                        right = ['num', +!r[2][1]];
                    return ["binary", op, left, right];
                }() || this;
            });
        },
        "conditional": function(c, t, e) {
            return make_conditional(walk(c), walk(t), walk(e));
        },
        "try": function(t, c, f) {
            return [
                "try",
                tighten(t),
                c != null ? [ c[0], tighten(c[1]) ] : null,
                f != null ? tighten(f) : null
            ];
        },
        "unary-prefix": function(op, expr) {
            expr = walk(expr);
            var ret = [ "unary-prefix", op, expr ];
            if (op == "!")
                ret = best_of(ret, negate(expr));
            return when_constant(ret, function(ast, val){
                return walk(ast); // it's either true or false, so minifies to !0 or !1
            }, function() { return ret });
        },
        "name": function(name) {
            switch (name) {
              case "true": return [ "unary-prefix", "!", [ "num", 0 ]];
              case "false": return [ "unary-prefix", "!", [ "num", 1 ]];
            }
        },
        "while": _do_while,
        "assign": function(op, lvalue, rvalue) {
            lvalue = walk(lvalue);
            rvalue = walk(rvalue);
            var okOps = [ '+', '-', '/', '*', '%', '>>', '<<', '>>>', '|', '^', '&' ];
            if (op === true && lvalue[0] === "name" && rvalue[0] === "binary" &&
                ~okOps.indexOf(rvalue[1]) && rvalue[2][0] === "name" &&
                rvalue[2][1] === lvalue[1]) {
                return [ this[0], rvalue[1], lvalue, rvalue[3] ]
            }
            return [ this[0], op, lvalue, rvalue ];
        },
        "call": function(expr, args) {
            expr = walk(expr);
            if (options.unsafe && expr[0] == "dot" && expr[1][0] == "string" && expr[2] == "toString") {
                return expr[1];
            }
            return [ this[0], expr,  MAP(args, walk) ];
        },
        "num": function (num) {
            if (!isFinite(num))
                return [ "binary", "/", num === 1 / 0
                         ? [ "num", 1 ] : num === -1 / 0
                         ? [ "unary-prefix", "-", [ "num", 1 ] ]
                         : [ "num", 0 ], [ "num", 0 ] ];

            return [ this[0], num ];
        }
    }, function() {
        return walk(prepare_ifs(walk(prepare_ifs(ast))));
    });
};

function squeeze_2(ast, options) {
    var w = ast_walker(), walk = w.walk, scope;
    function with_scope(s, cont) {
        var save = scope, ret;
        scope = s;
        ret = cont();
        scope = save;
        return ret;
    };
    function lambda(name, args, body) {
        return [ this[0], name, args, with_scope(body.scope, curry(MAP, body, walk)) ];
    };
    return w.with_walkers({
        "directive": function(dir) {
            if (scope.active_directive(dir))
                return [ "block" ];
            scope.directives.push(dir);
        },
        "toplevel": function(body) {
            return [ this[0], with_scope(this.scope, curry(MAP, body, walk)) ];
        },
        "function": lambda,
        "defun": lambda
    }, function(){
        return walk(ast_add_scope(ast));
    });
};

/* -----[ re-generate code from the AST ]----- */

var DOT_CALL_NO_PARENS = jsp.array_to_hash([
    "name",
    "array",
    "object",
    "string",
    "dot",
    "sub",
    "call",
    "regexp",
    "defun"
]);

function make_string(str, ascii_only) {
    var dq = 0, sq = 0;
    str = str.replace(/[\\\b\f\n\r\t\x22\x27\u2028\u2029\0]/g, function(s){
        switch (s) {
          case "\\": return "\\\\";
          case "\b": return "\\b";
          case "\f": return "\\f";
          case "\n": return "\\n";
          case "\r": return "\\r";
          case "\u2028": return "\\u2028";
          case "\u2029": return "\\u2029";
          case '"': ++dq; return '"';
          case "'": ++sq; return "'";
          case "\0": return "\\0";
        }
        return s;
    });
    if (ascii_only) str = to_ascii(str);
    if (dq > sq) return "'" + str.replace(/\x27/g, "\\'") + "'";
    else return '"' + str.replace(/\x22/g, '\\"') + '"';
};

function to_ascii(str) {
    return str.replace(/[\u0080-\uffff]/g, function(ch) {
        var code = ch.charCodeAt(0).toString(16);
        while (code.length < 4) code = "0" + code;
        return "\\u" + code;
    });
};

var SPLICE_NEEDS_BRACKETS = jsp.array_to_hash([ "if", "while", "do", "for", "for-in", "with" ]);

function gen_code(ast, options) {
    options = defaults(options, {
        indent_start : 0,
        indent_level : 4,
        quote_keys   : false,
        space_colon  : false,
        beautify     : false,
        ascii_only   : false,
        inline_script: false
    });
    var beautify = !!options.beautify;
    var indentation = 0,
    newline = beautify ? "\n" : "",
    space = beautify ? " " : "";

    function encode_string(str) {
        var ret = make_string(str, options.ascii_only);
        if (options.inline_script)
            ret = ret.replace(/<\x2fscript([>\/\t\n\f\r ])/gi, "<\\/script$1");
        return ret;
    };

    function make_name(name) {
        name = name.toString();
        if (options.ascii_only)
            name = to_ascii(name);
        return name;
    };

    function indent(line) {
        if (line == null)
            line = "";
        if (beautify)
            line = repeat_string(" ", options.indent_start + indentation * options.indent_level) + line;
        return line;
    };

    function with_indent(cont, incr) {
        if (incr == null) incr = 1;
        indentation += incr;
        try { return cont.apply(null, slice(arguments, 1)); }
        finally { indentation -= incr; }
    };

    function last_char(str) {
        str = str.toString();
        return str.charAt(str.length - 1);
    };

    function first_char(str) {
        return str.toString().charAt(0);
    };

    function add_spaces(a) {
        if (beautify)
            return a.join(" ");
        var b = [];
        for (var i = 0; i < a.length; ++i) {
            var next = a[i + 1];
            b.push(a[i]);
            if (next &&
                ((is_identifier_char(last_char(a[i])) && (is_identifier_char(first_char(next))
                                                          || first_char(next) == "\\")) ||
                 (/[\+\-]$/.test(a[i].toString()) && /^[\+\-]/.test(next.toString()) ||
                 last_char(a[i]) == "/" && first_char(next) == "/"))) {
                b.push(" ");
            }
        }
        return b.join("");
    };

    function add_commas(a) {
        return a.join("," + space);
    };

    function parenthesize(expr) {
        var gen = make(expr);
        for (var i = 1; i < arguments.length; ++i) {
            var el = arguments[i];
            if ((el instanceof Function && el(expr)) || expr[0] == el)
                return "(" + gen + ")";
        }
        return gen;
    };

    function best_of(a) {
        if (a.length == 1) {
            return a[0];
        }
        if (a.length == 2) {
            var b = a[1];
            a = a[0];
            return a.length <= b.length ? a : b;
        }
        return best_of([ a[0], best_of(a.slice(1)) ]);
    };

    function needs_parens(expr) {
        if (expr[0] == "function" || expr[0] == "object") {
            // dot/call on a literal function requires the
            // function literal itself to be parenthesized
            // only if it's the first "thing" in a
            // statement.  This means that the parent is
            // "stat", but it could also be a "seq" and
            // we're the first in this "seq" and the
            // parent is "stat", and so on.  Messy stuff,
            // but it worths the trouble.
            var a = slice(w.stack()), self = a.pop(), p = a.pop();
            while (p) {
                if (p[0] == "stat") return true;
                if (((p[0] == "seq" || p[0] == "call" || p[0] == "dot" || p[0] == "sub" || p[0] == "conditional") && p[1] === self) ||
                    ((p[0] == "binary" || p[0] == "assign" || p[0] == "unary-postfix") && p[2] === self)) {
                    self = p;
                    p = a.pop();
                } else {
                    return false;
                }
            }
        }
        return !HOP(DOT_CALL_NO_PARENS, expr[0]);
    };

    function make_num(num) {
        var str = num.toString(10), a = [ str.replace(/^0\./, ".").replace('e+', 'e') ], m;
        if (Math.floor(num) === num) {
            if (num >= 0) {
                a.push("0x" + num.toString(16).toLowerCase(), // probably pointless
                       "0" + num.toString(8)); // same.
            } else {
                a.push("-0x" + (-num).toString(16).toLowerCase(), // probably pointless
                       "-0" + (-num).toString(8)); // same.
            }
            if ((m = /^(.*?)(0+)$/.exec(num))) {
                a.push(m[1] + "e" + m[2].length);
            }
        } else if ((m = /^0?\.(0+)(.*)$/.exec(num))) {
            a.push(m[2] + "e-" + (m[1].length + m[2].length),
                   str.substr(str.indexOf(".")));
        }
        return best_of(a);
    };

    var w = ast_walker();
    var make = w.walk;
    return w.with_walkers({
        "string": encode_string,
        "num": make_num,
        "name": make_name,
        "debugger": function(){ return "debugger;" },
        "toplevel": function(statements) {
            return make_block_statements(statements)
                .join(newline + newline);
        },
        "splice": function(statements) {
            var parent = w.parent();
            if (HOP(SPLICE_NEEDS_BRACKETS, parent)) {
                // we need block brackets in this case
                return make_block.apply(this, arguments);
            } else {
                return MAP(make_block_statements(statements, true),
                           function(line, i) {
                               // the first line is already indented
                               return i > 0 ? indent(line) : line;
                           }).join(newline);
            }
        },
        "block": make_block,
        "var": function(defs) {
            return "var " + add_commas(MAP(defs, make_1vardef)) + ";";
        },
        "const": function(defs) {
            return "const " + add_commas(MAP(defs, make_1vardef)) + ";";
        },
        "try": function(tr, ca, fi) {
            var out = [ "try", make_block(tr) ];
            if (ca) out.push("catch", "(" + ca[0] + ")", make_block(ca[1]));
            if (fi) out.push("finally", make_block(fi));
            return add_spaces(out);
        },
        "throw": function(expr) {
            return add_spaces([ "throw", make(expr) ]) + ";";
        },
        "new": function(ctor, args) {
            args = args.length > 0 ? "(" + add_commas(MAP(args, function(expr){
                return parenthesize(expr, "seq");
            })) + ")" : "";
            return add_spaces([ "new", parenthesize(ctor, "seq", "binary", "conditional", "assign", function(expr){
                var w = ast_walker(), has_call = {};
                try {
                    w.with_walkers({
                        "call": function() { throw has_call },
                        "function": function() { return this }
                    }, function(){
                        w.walk(expr);
                    });
                } catch(ex) {
                    if (ex === has_call)
                        return true;
                    throw ex;
                }
            }) + args ]);
        },
        "switch": function(expr, body) {
            return add_spaces([ "switch", "(" + make(expr) + ")", make_switch_block(body) ]);
        },
        "break": function(label) {
            var out = "break";
            if (label != null)
                out += " " + make_name(label);
            return out + ";";
        },
        "continue": function(label) {
            var out = "continue";
            if (label != null)
                out += " " + make_name(label);
            return out + ";";
        },
        "conditional": function(co, th, el) {
            return add_spaces([ parenthesize(co, "assign", "seq", "conditional"), "?",
                                parenthesize(th, "seq"), ":",
                                parenthesize(el, "seq") ]);
        },
        "assign": function(op, lvalue, rvalue) {
            if (op && op !== true) op += "=";
            else op = "=";
            return add_spaces([ make(lvalue), op, parenthesize(rvalue, "seq") ]);
        },
        "dot": function(expr) {
            var out = make(expr), i = 1;
            if (expr[0] == "num") {
                if (!/[a-f.]/i.test(out))
                    out += ".";
            } else if (expr[0] != "function" && needs_parens(expr))
                out = "(" + out + ")";
            while (i < arguments.length)
                out += "." + make_name(arguments[i++]);
            return out;
        },
        "call": function(func, args) {
            var f = make(func);
            if (f.charAt(0) != "(" && needs_parens(func))
                f = "(" + f + ")";
            return f + "(" + add_commas(MAP(args, function(expr){
                return parenthesize(expr, "seq");
            })) + ")";
        },
        "function": make_function,
        "defun": make_function,
        "if": function(co, th, el) {
            var out = [ "if", "(" + make(co) + ")", el ? make_then(th) : make(th) ];
            if (el) {
                out.push("else", make(el));
            }
            return add_spaces(out);
        },
        "for": function(init, cond, step, block) {
            var out = [ "for" ];
            init = (init != null ? make(init) : "").replace(/;*\s*$/, ";" + space);
            cond = (cond != null ? make(cond) : "").replace(/;*\s*$/, ";" + space);
            step = (step != null ? make(step) : "").replace(/;*\s*$/, "");
            var args = init + cond + step;
            if (args == "; ; ") args = ";;";
            out.push("(" + args + ")", make(block));
            return add_spaces(out);
        },
        "for-in": function(vvar, key, hash, block) {
            return add_spaces([ "for", "(" +
                                (vvar ? make(vvar).replace(/;+$/, "") : make(key)),
                                "in",
                                make(hash) + ")", make(block) ]);
        },
        "while": function(condition, block) {
            return add_spaces([ "while", "(" + make(condition) + ")", make(block) ]);
        },
        "do": function(condition, block) {
            return add_spaces([ "do", make(block), "while", "(" + make(condition) + ")" ]) + ";";
        },
        "return": function(expr) {
            var out = [ "return" ];
            if (expr != null) out.push(make(expr));
            return add_spaces(out) + ";";
        },
        "binary": function(operator, lvalue, rvalue) {
            var left = make(lvalue), right = make(rvalue);
            // XXX: I'm pretty sure other cases will bite here.
            //      we need to be smarter.
            //      adding parens all the time is the safest bet.
            if (member(lvalue[0], [ "assign", "conditional", "seq" ]) ||
                lvalue[0] == "binary" && PRECEDENCE[operator] > PRECEDENCE[lvalue[1]] ||
                lvalue[0] == "function" && needs_parens(this)) {
                left = "(" + left + ")";
            }
            if (member(rvalue[0], [ "assign", "conditional", "seq" ]) ||
                rvalue[0] == "binary" && PRECEDENCE[operator] >= PRECEDENCE[rvalue[1]] &&
                !(rvalue[1] == operator && member(operator, [ "&&", "||", "*" ]))) {
                right = "(" + right + ")";
            }
            else if (!beautify && options.inline_script && (operator == "<" || operator == "<<")
                     && rvalue[0] == "regexp" && /^script/i.test(rvalue[1])) {
                right = " " + right;
            }
            return add_spaces([ left, operator, right ]);
        },
        "unary-prefix": function(operator, expr) {
            var val = make(expr);
            if (!(expr[0] == "num" || (expr[0] == "unary-prefix" && !HOP(OPERATORS, operator + expr[1])) || !needs_parens(expr)))
                val = "(" + val + ")";
            return operator + (jsp.is_alphanumeric_char(operator.charAt(0)) ? " " : "") + val;
        },
        "unary-postfix": function(operator, expr) {
            var val = make(expr);
            if (!(expr[0] == "num" || (expr[0] == "unary-postfix" && !HOP(OPERATORS, operator + expr[1])) || !needs_parens(expr)))
                val = "(" + val + ")";
            return val + operator;
        },
        "sub": function(expr, subscript) {
            var hash = make(expr);
            if (needs_parens(expr))
                hash = "(" + hash + ")";
            return hash + "[" + make(subscript) + "]";
        },
        "object": function(props) {
            var obj_needs_parens = needs_parens(this);
            if (props.length == 0)
                return obj_needs_parens ? "({})" : "{}";
            var out = "{" + newline + with_indent(function(){
                return MAP(props, function(p){
                    if (p.length == 3) {
                        // getter/setter.  The name is in p[0], the arg.list in p[1][2], the
                        // body in p[1][3] and type ("get" / "set") in p[2].
                        return indent(make_function(p[0], p[1][2], p[1][3], p[2], true));
                    }
                    var key = p[0], val = parenthesize(p[1], "seq");
                    if (options.quote_keys) {
                        key = encode_string(key);
                    } else if ((typeof key == "number" || !beautify && +key + "" == key)
                               && parseFloat(key) >= 0) {
                        key = make_num(+key);
                    } else if (!is_identifier(key)) {
                        key = encode_string(key);
                    }
                    return indent(add_spaces(beautify && options.space_colon
                                             ? [ key, ":", val ]
                                             : [ key + ":", val ]));
                }).join("," + newline);
            }) + newline + indent("}");
            return obj_needs_parens ? "(" + out + ")" : out;
        },
        "regexp": function(rx, mods) {
            if (options.ascii_only) rx = to_ascii(rx);
            return "/" + rx + "/" + mods;
        },
        "array": function(elements) {
            if (elements.length == 0) return "[]";
            return add_spaces([ "[", add_commas(MAP(elements, function(el, i){
                if (!beautify && el[0] == "atom" && el[1] == "undefined") return i === elements.length - 1 ? "," : "";
                return parenthesize(el, "seq");
            })), "]" ]);
        },
        "stat": function(stmt) {
            return stmt != null
                ? make(stmt).replace(/;*\s*$/, ";")
                : ";";
        },
        "seq": function() {
            return add_commas(MAP(slice(arguments), make));
        },
        "label": function(name, block) {
            return add_spaces([ make_name(name), ":", make(block) ]);
        },
        "with": function(expr, block) {
            return add_spaces([ "with", "(" + make(expr) + ")", make(block) ]);
        },
        "atom": function(name) {
            return make_name(name);
        },
        "directive": function(dir) {
            return make_string(dir) + ";";
        }
    }, function(){ return make(ast) });

    // The squeezer replaces "block"-s that contain only a single
    // statement with the statement itself; technically, the AST
    // is correct, but this can create problems when we output an
    // IF having an ELSE clause where the THEN clause ends in an
    // IF *without* an ELSE block (then the outer ELSE would refer
    // to the inner IF).  This function checks for this case and
    // adds the block brackets if needed.
    function make_then(th) {
        if (th == null) return ";";
        if (th[0] == "do") {
            // https://github.com/mishoo/UglifyJS/issues/#issue/57
            // IE croaks with "syntax error" on code like this:
            //     if (foo) do ... while(cond); else ...
            // we need block brackets around do/while
            return make_block([ th ]);
        }
        var b = th;
        while (true) {
            var type = b[0];
            if (type == "if") {
                if (!b[3])
                    // no else, we must add the block
                    return make([ "block", [ th ]]);
                b = b[3];
            }
            else if (type == "while" || type == "do") b = b[2];
            else if (type == "for" || type == "for-in") b = b[4];
            else break;
        }
        return make(th);
    };

    function make_function(name, args, body, keyword, no_parens) {
        var out = keyword || "function";
        if (name) {
            out += " " + make_name(name);
        }
        out += "(" + add_commas(MAP(args, make_name)) + ")";
        out = add_spaces([ out, make_block(body) ]);
        return (!no_parens && needs_parens(this)) ? "(" + out + ")" : out;
    };

    function must_has_semicolon(node) {
        switch (node[0]) {
          case "with":
          case "while":
            return empty(node[2]) || must_has_semicolon(node[2]);
          case "for":
          case "for-in":
            return empty(node[4]) || must_has_semicolon(node[4]);
          case "if":
            if (empty(node[2]) && !node[3]) return true; // `if' with empty `then' and no `else'
            if (node[3]) {
                if (empty(node[3])) return true; // `else' present but empty
                return must_has_semicolon(node[3]); // dive into the `else' branch
            }
            return must_has_semicolon(node[2]); // dive into the `then' branch
          case "directive":
            return true;
        }
    };

    function make_block_statements(statements, noindent) {
        for (var a = [], last = statements.length - 1, i = 0; i <= last; ++i) {
            var stat = statements[i];
            var code = make(stat);
            if (code != ";") {
                if (!beautify && i == last && !must_has_semicolon(stat)) {
                    code = code.replace(/;+\s*$/, "");
                }
                a.push(code);
            }
        }
        return noindent ? a : MAP(a, indent);
    };

    function make_switch_block(body) {
        var n = body.length;
        if (n == 0) return "{}";
        return "{" + newline + MAP(body, function(branch, i){
            var has_body = branch[1].length > 0, code = with_indent(function(){
                return indent(branch[0]
                              ? add_spaces([ "case", make(branch[0]) + ":" ])
                              : "default:");
            }, 0.5) + (has_body ? newline + with_indent(function(){
                return make_block_statements(branch[1]).join(newline);
            }) : "");
            if (!beautify && has_body && i < n - 1)
                code += ";";
            return code;
        }).join(newline) + newline + indent("}");
    };

    function make_block(statements) {
        if (!statements) return ";";
        if (statements.length == 0) return "{}";
        return "{" + newline + with_indent(function(){
            return make_block_statements(statements).join(newline);
        }) + newline + indent("}");
    };

    function make_1vardef(def) {
        var name = def[0], val = def[1];
        if (val != null)
            name = add_spaces([ make_name(name), "=", parenthesize(val, "seq") ]);
        return name;
    };

};

function split_lines(code, max_line_length) {
    var splits = [ 0 ];
    jsp.parse(function(){
        var next_token = jsp.tokenizer(code);
        var last_split = 0;
        var prev_token;
        function current_length(tok) {
            return tok.pos - last_split;
        };
        function split_here(tok) {
            last_split = tok.pos;
            splits.push(last_split);
        };
        function custom(){
            var tok = next_token.apply(this, arguments);
            out: {
                if (prev_token) {
                    if (prev_token.type == "keyword") break out;
                }
                if (current_length(tok) > max_line_length) {
                    switch (tok.type) {
                      case "keyword":
                      case "atom":
                      case "name":
                      case "punc":
                        split_here(tok);
                        break out;
                    }
                }
            }
            prev_token = tok;
            return tok;
        };
        custom.context = function() {
            return next_token.context.apply(this, arguments);
        };
        return custom;
    }());
    return splits.map(function(pos, i){
        return code.substring(pos, splits[i + 1] || code.length);
    }).join("\n");
};

/* -----[ Utilities ]----- */

function repeat_string(str, i) {
    if (i <= 0) return "";
    if (i == 1) return str;
    var d = repeat_string(str, i >> 1);
    d += d;
    if (i & 1) d += str;
    return d;
};

function defaults(args, defs) {
    var ret = {};
    if (args === true)
        args = {};
    for (var i in defs) if (HOP(defs, i)) {
        ret[i] = (args && HOP(args, i)) ? args[i] : defs[i];
    }
    return ret;
};

function is_identifier(name) {
    return /^[a-z_$][a-z0-9_$]*$/i.test(name)
        && name != "this"
        && !HOP(jsp.KEYWORDS_ATOM, name)
        && !HOP(jsp.RESERVED_WORDS, name)
        && !HOP(jsp.KEYWORDS, name);
};

function HOP(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};

// some utilities

var MAP;

(function(){
    MAP = function(a, f, o) {
        var ret = [], top = [], i;
        function doit() {
            var val = f.call(o, a[i], i);
            if (val instanceof AtTop) {
                val = val.v;
                if (val instanceof Splice) {
                    top.push.apply(top, val.v);
                } else {
                    top.push(val);
                }
            }
            else if (val != skip) {
                if (val instanceof Splice) {
                    ret.push.apply(ret, val.v);
                } else {
                    ret.push(val);
                }
            }
        };
        if (a instanceof Array) for (i = 0; i < a.length; ++i) doit();
        else for (i in a) if (HOP(a, i)) doit();
        return top.concat(ret);
    };
    MAP.at_top = function(val) { return new AtTop(val) };
    MAP.splice = function(val) { return new Splice(val) };
    var skip = MAP.skip = {};
    function AtTop(val) { this.v = val };
    function Splice(val) { this.v = val };
})();

/* -----[ Exports ]----- */

exports.ast_walker = ast_walker;
exports.ast_mangle = ast_mangle;
exports.ast_squeeze = ast_squeeze;
exports.ast_lift_variables = ast_lift_variables;
exports.gen_code = gen_code;
exports.ast_add_scope = ast_add_scope;
exports.set_logger = function(logger) { warn = logger };
exports.make_string = make_string;
exports.split_lines = split_lines;
exports.MAP = MAP;

// keep this last!
exports.ast_squeeze_more = require("./squeeze-more").ast_squeeze_more;

// Local variables:
// js-indent-level: 4
// End:

});

require.define("/node_modules/uglify-js/lib/squeeze-more.js",function(require,module,exports,__dirname,__filename,process,global){var jsp = require("./parse-js"),
    pro = require("./process"),
    slice = jsp.slice,
    member = jsp.member,
    curry = jsp.curry,
    MAP = pro.MAP,
    PRECEDENCE = jsp.PRECEDENCE,
    OPERATORS = jsp.OPERATORS;

function ast_squeeze_more(ast) {
    var w = pro.ast_walker(), walk = w.walk, scope;
    function with_scope(s, cont) {
        var save = scope, ret;
        scope = s;
        ret = cont();
        scope = save;
        return ret;
    };
    function _lambda(name, args, body) {
        return [ this[0], name, args, with_scope(body.scope, curry(MAP, body, walk)) ];
    };
    return w.with_walkers({
        "toplevel": function(body) {
            return [ this[0], with_scope(this.scope, curry(MAP, body, walk)) ];
        },
        "function": _lambda,
        "defun": _lambda,
        "new": function(ctor, args) {
            if (ctor[0] == "name") {
                if (ctor[1] == "Array" && !scope.has("Array")) {
                    if (args.length != 1) {
                        return [ "array", args ];
                    } else {
                        return walk([ "call", [ "name", "Array" ], args ]);
                    }
                } else if (ctor[1] == "Object" && !scope.has("Object")) {
                    if (!args.length) {
                        return [ "object", [] ];
                    } else {
                        return walk([ "call", [ "name", "Object" ], args ]);
                    }
                } else if ((ctor[1] == "RegExp" || ctor[1] == "Function" || ctor[1] == "Error") && !scope.has(ctor[1])) {
                    return walk([ "call", [ "name", ctor[1] ], args]);
                }
            }
        },
        "call": function(expr, args) {
            if (expr[0] == "dot" && expr[1][0] == "string" && args.length == 1
                && (args[0][1] > 0 && expr[2] == "substring" || expr[2] == "substr")) {
                return [ "call", [ "dot", expr[1], "slice"], args];
            }
            if (expr[0] == "dot" && expr[2] == "toString" && args.length == 0) {
                // foo.toString()  ==>  foo+""
                if (expr[1][0] == "string") return expr[1];
                return [ "binary", "+", expr[1], [ "string", "" ]];
            }
            if (expr[0] == "name") {
                if (expr[1] == "Array" && args.length != 1 && !scope.has("Array")) {
                    return [ "array", args ];
                }
                if (expr[1] == "Object" && !args.length && !scope.has("Object")) {
                    return [ "object", [] ];
                }
                if (expr[1] == "String" && !scope.has("String")) {
                    return [ "binary", "+", args[0], [ "string", "" ]];
                }
            }
        }
    }, function() {
        return walk(pro.ast_add_scope(ast));
    });
};

exports.ast_squeeze_more = ast_squeeze_more;

// Local variables:
// js-indent-level: 4
// End:

});

require.define("/node_modules/uglify-js/lib/consolidator.js",function(require,module,exports,__dirname,__filename,process,global){/**
 * @preserve Copyright 2012 Robert Gust-Bardon <http://robert.gust-bardon.org/>.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 *     * Redistributions of source code must retain the above
 *       copyright notice, this list of conditions and the following
 *       disclaimer.
 *
 *     * Redistributions in binary form must reproduce the above
 *       copyright notice, this list of conditions and the following
 *       disclaimer in the documentation and/or other materials
 *       provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
 * OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
 * THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 */

/**
 * @fileoverview Enhances <a href="https://github.com/mishoo/UglifyJS/"
 * >UglifyJS</a> with consolidation of null, Boolean, and String values.
 * <p>Also known as aliasing, this feature has been deprecated in <a href=
 * "http://closure-compiler.googlecode.com/">the Closure Compiler</a> since its
 * initial release, where it is unavailable from the <abbr title=
 * "command line interface">CLI</a>. The Closure Compiler allows one to log and
 * influence this process. In contrast, this implementation does not introduce
 * any variable declarations in global code and derives String values from
 * identifier names used as property accessors.</p>
 * <p>Consolidating literals may worsen the data compression ratio when an <a
 * href="http://tools.ietf.org/html/rfc2616#section-3.5">encoding
 * transformation</a> is applied. For instance, <a href=
 * "http://code.jquery.com/jquery-1.7.1.js">jQuery 1.7.1</a> takes 248235 bytes.
 * Building it with <a href="https://github.com/mishoo/UglifyJS/tarball/v1.2.5">
 * UglifyJS v1.2.5</a> results in 93647 bytes (37.73% of the original) which are
 * then compressed to 33154 bytes (13.36% of the original) using <a href=
 * "http://linux.die.net/man/1/gzip">gzip(1)</a>. Building it with the same
 * version of UglifyJS 1.2.5 patched with the implementation of consolidation
 * results in 80784 bytes (a decrease of 12863 bytes, i.e. 13.74%, in comparison
 * to the aforementioned 93647 bytes) which are then compressed to 34013 bytes
 * (an increase of 859 bytes, i.e. 2.59%, in comparison to the aforementioned
 * 33154 bytes).</p>
 * <p>Written in <a href="http://es5.github.com/#x4.2.2">the strict variant</a>
 * of <a href="http://es5.github.com/">ECMA-262 5.1 Edition</a>. Encoded in <a
 * href="http://tools.ietf.org/html/rfc3629">UTF-8</a>. Follows <a href=
 * "http://google-styleguide.googlecode.com/svn-history/r76/trunk/javascriptguide.xml"
 * >Revision 2.28 of the Google JavaScript Style Guide</a> (except for the
 * discouraged use of the {@code function} tag and the {@code namespace} tag).
 * 100% typed for the <a href=
 * "http://closure-compiler.googlecode.com/files/compiler-20120123.tar.gz"
 * >Closure Compiler Version 1741</a>.</p>
 * <p>Should you find this software useful, please consider <a href=
 * "https://paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=JZLW72X8FD4WG"
 * >a donation</a>.</p>
 * @author follow.me@RGustBardon (Robert Gust-Bardon)
 * @supported Tested with:
 *     <ul>
 *     <li><a href="http://nodejs.org/dist/v0.6.10/">Node v0.6.10</a>,</li>
 *     <li><a href="https://github.com/mishoo/UglifyJS/tarball/v1.2.5">UglifyJS
 *       v1.2.5</a>.</li>
 *     </ul>
 */

/*global console:false, exports:true, module:false, require:false */
/*jshint sub:true */
/**
 * Consolidates null, Boolean, and String values found inside an <abbr title=
 * "abstract syntax tree">AST</abbr>.
 * @param {!TSyntacticCodeUnit} oAbstractSyntaxTree An array-like object
 *     representing an <abbr title="abstract syntax tree">AST</abbr>.
 * @return {!TSyntacticCodeUnit} An array-like object representing an <abbr
 *     title="abstract syntax tree">AST</abbr> with its null, Boolean, and
 *     String values consolidated.
 */
// TODO(user) Consolidation of mathematical values found in numeric literals.
// TODO(user) Unconsolidation.
// TODO(user) Consolidation of ECMA-262 6th Edition programs.
// TODO(user) Rewrite in ECMA-262 6th Edition.
exports['ast_consolidate'] = function(oAbstractSyntaxTree) {
  'use strict';
  /*jshint bitwise:true, curly:true, eqeqeq:true, forin:true, immed:true,
        latedef:true, newcap:true, noarge:true, noempty:true, nonew:true,
        onevar:true, plusplus:true, regexp:true, undef:true, strict:true,
        sub:false, trailing:true */

  var _,
      /**
       * A record consisting of data about one or more source elements.
       * @constructor
       * @nosideeffects
       */
      TSourceElementsData = function() {
        /**
         * The category of the elements.
         * @type {number}
         * @see ESourceElementCategories
         */
        this.nCategory = ESourceElementCategories.N_OTHER;
        /**
         * The number of occurrences (within the elements) of each primitive
         * value that could be consolidated.
         * @type {!Array.<!Object.<string, number>>}
         */
        this.aCount = [];
        this.aCount[EPrimaryExpressionCategories.N_IDENTIFIER_NAMES] = {};
        this.aCount[EPrimaryExpressionCategories.N_STRING_LITERALS] = {};
        this.aCount[EPrimaryExpressionCategories.N_NULL_AND_BOOLEAN_LITERALS] =
            {};
        /**
         * Identifier names found within the elements.
         * @type {!Array.<string>}
         */
        this.aIdentifiers = [];
        /**
         * Prefixed representation Strings of each primitive value that could be
         * consolidated within the elements.
         * @type {!Array.<string>}
         */
        this.aPrimitiveValues = [];
      },
      /**
       * A record consisting of data about a primitive value that could be
       * consolidated.
       * @constructor
       * @nosideeffects
       */
      TPrimitiveValue = function() {
        /**
         * The difference in the number of terminal symbols between the original
         * source text and the one with the primitive value consolidated. If the
         * difference is positive, the primitive value is considered worthwhile.
         * @type {number}
         */
        this.nSaving = 0;
        /**
         * An identifier name of the variable that will be declared and assigned
         * the primitive value if the primitive value is consolidated.
         * @type {string}
         */
        this.sName = '';
      },
      /**
       * A record consisting of data on what to consolidate within the range of
       * source elements that is currently being considered.
       * @constructor
       * @nosideeffects
       */
      TSolution = function() {
        /**
         * An object whose keys are prefixed representation Strings of each
         * primitive value that could be consolidated within the elements and
         * whose values are corresponding data about those primitive values.
         * @type {!Object.<string, {nSaving: number, sName: string}>}
         * @see TPrimitiveValue
         */
        this.oPrimitiveValues = {};
        /**
         * The difference in the number of terminal symbols between the original
         * source text and the one with all the worthwhile primitive values
         * consolidated.
         * @type {number}
         * @see TPrimitiveValue#nSaving
         */
        this.nSavings = 0;
      },
      /**
       * The processor of <abbr title="abstract syntax tree">AST</abbr>s found
       * in UglifyJS.
       * @namespace
       * @type {!TProcessor}
       */
      oProcessor = (/** @type {!TProcessor} */ require('./process')),
      /**
       * A record consisting of a number of constants that represent the
       * difference in the number of terminal symbols between a source text with
       * a modified syntactic code unit and the original one.
       * @namespace
       * @type {!Object.<string, number>}
       */
      oWeights = {
        /**
         * The difference in the number of punctuators required by the bracket
         * notation and the dot notation.
         * <p><code>'[]'.length - '.'.length</code></p>
         * @const
         * @type {number}
         */
        N_PROPERTY_ACCESSOR: 1,
        /**
         * The number of punctuators required by a variable declaration with an
         * initialiser.
         * <p><code>':'.length + ';'.length</code></p>
         * @const
         * @type {number}
         */
        N_VARIABLE_DECLARATION: 2,
        /**
         * The number of terminal symbols required to introduce a variable
         * statement (excluding its variable declaration list).
         * <p><code>'var '.length</code></p>
         * @const
         * @type {number}
         */
        N_VARIABLE_STATEMENT_AFFIXATION: 4,
        /**
         * The number of terminal symbols needed to enclose source elements
         * within a function call with no argument values to a function with an
         * empty parameter list.
         * <p><code>'(function(){}());'.length</code></p>
         * @const
         * @type {number}
         */
        N_CLOSURE: 17
      },
      /**
       * Categories of primary expressions from which primitive values that
       * could be consolidated are derivable.
       * @namespace
       * @enum {number}
       */
      EPrimaryExpressionCategories = {
        /**
         * Identifier names used as property accessors.
         * @type {number}
         */
        N_IDENTIFIER_NAMES: 0,
        /**
         * String literals.
         * @type {number}
         */
        N_STRING_LITERALS: 1,
        /**
         * Null and Boolean literals.
         * @type {number}
         */
        N_NULL_AND_BOOLEAN_LITERALS: 2
      },
      /**
       * Prefixes of primitive values that could be consolidated.
       * The String values of the prefixes must have same number of characters.
       * The prefixes must not be used in any properties defined in any version
       * of <a href=
       * "http://www.ecma-international.org/publications/standards/Ecma-262.htm"
       * >ECMA-262</a>.
       * @namespace
       * @enum {string}
       */
      EValuePrefixes = {
        /**
         * Identifies String values.
         * @type {string}
         */
        S_STRING: '#S',
        /**
         * Identifies null and Boolean values.
         * @type {string}
         */
        S_SYMBOLIC: '#O'
      },
      /**
       * Categories of source elements in terms of their appropriateness of
       * having their primitive values consolidated.
       * @namespace
       * @enum {number}
       */
      ESourceElementCategories = {
        /**
         * Identifies a source element that includes the <a href=
         * "http://es5.github.com/#x12.10">{@code with}</a> statement.
         * @type {number}
         */
        N_WITH: 0,
        /**
         * Identifies a source element that includes the <a href=
         * "http://es5.github.com/#x15.1.2.1">{@code eval}</a> identifier name.
         * @type {number}
         */
        N_EVAL: 1,
        /**
         * Identifies a source element that must be excluded from the process
         * unless its whole scope is examined.
         * @type {number}
         */
        N_EXCLUDABLE: 2,
        /**
         * Identifies source elements not posing any problems.
         * @type {number}
         */
        N_OTHER: 3
      },
      /**
       * The list of literals (other than the String ones) whose primitive
       * values can be consolidated.
       * @const
       * @type {!Array.<string>}
       */
      A_OTHER_SUBSTITUTABLE_LITERALS = [
        'null',   // The null literal.
        'false',  // The Boolean literal {@code false}.
        'true'    // The Boolean literal {@code true}.
      ];

  (/**
    * Consolidates all worthwhile primitive values in a syntactic code unit.
    * @param {!TSyntacticCodeUnit} oSyntacticCodeUnit An array-like object
    *     representing the branch of the abstract syntax tree representing the
    *     syntactic code unit along with its scope.
    * @see TPrimitiveValue#nSaving
    */
   function fExamineSyntacticCodeUnit(oSyntacticCodeUnit) {
     var _,
         /**
          * Indicates whether the syntactic code unit represents global code.
          * @type {boolean}
          */
         bIsGlobal = 'toplevel' === oSyntacticCodeUnit[0],
         /**
          * Indicates whether the whole scope is being examined.
          * @type {boolean}
          */
         bIsWhollyExaminable = !bIsGlobal,
         /**
          * An array-like object representing source elements that constitute a
          * syntactic code unit.
          * @type {!TSyntacticCodeUnit}
          */
         oSourceElements,
         /**
          * A record consisting of data about the source element that is
          * currently being examined.
          * @type {!TSourceElementsData}
          */
         oSourceElementData,
         /**
          * The scope of the syntactic code unit.
          * @type {!TScope}
          */
         oScope,
         /**
          * An instance of an object that allows the traversal of an <abbr
          * title="abstract syntax tree">AST</abbr>.
          * @type {!TWalker}
          */
         oWalker,
         /**
          * An object encompassing collections of functions used during the
          * traversal of an <abbr title="abstract syntax tree">AST</abbr>.
          * @namespace
          * @type {!Object.<string, !Object.<string, function(...[*])>>}
          */
         oWalkers = {
           /**
            * A collection of functions used during the surveyance of source
            * elements.
            * @namespace
            * @type {!Object.<string, function(...[*])>}
            */
           oSurveySourceElement: {
             /**#nocode+*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
             /**
              * Classifies the source element as excludable if it does not
              * contain a {@code with} statement or the {@code eval} identifier
              * name. Adds the identifier of the function and its formal
              * parameters to the list of identifier names found.
              * @param {string} sIdentifier The identifier of the function.
              * @param {!Array.<string>} aFormalParameterList Formal parameters.
              * @param {!TSyntacticCodeUnit} oFunctionBody Function code.
              */
             'defun': function(
                 sIdentifier,
                 aFormalParameterList,
                 oFunctionBody) {
               fClassifyAsExcludable();
               fAddIdentifier(sIdentifier);
               aFormalParameterList.forEach(fAddIdentifier);
             },
             /**
              * Increments the count of the number of occurrences of the String
              * value that is equivalent to the sequence of terminal symbols
              * that constitute the encountered identifier name.
              * @param {!TSyntacticCodeUnit} oExpression The nonterminal
              *     MemberExpression.
              * @param {string} sIdentifierName The identifier name used as the
              *     property accessor.
              * @return {!Array} The encountered branch of an <abbr title=
              *     "abstract syntax tree">AST</abbr> with its nonterminal
              *     MemberExpression traversed.
              */
             'dot': function(oExpression, sIdentifierName) {
               fCountPrimaryExpression(
                   EPrimaryExpressionCategories.N_IDENTIFIER_NAMES,
                   EValuePrefixes.S_STRING + sIdentifierName);
               return ['dot', oWalker.walk(oExpression), sIdentifierName];
             },
             /**
              * Adds the optional identifier of the function and its formal
              * parameters to the list of identifier names found.
              * @param {?string} sIdentifier The optional identifier of the
              *     function.
              * @param {!Array.<string>} aFormalParameterList Formal parameters.
              * @param {!TSyntacticCodeUnit} oFunctionBody Function code.
              */
             'function': function(
                 sIdentifier,
                 aFormalParameterList,
                 oFunctionBody) {
               if ('string' === typeof sIdentifier) {
                 fAddIdentifier(sIdentifier);
               }
               aFormalParameterList.forEach(fAddIdentifier);
             },
             /**
              * Either increments the count of the number of occurrences of the
              * encountered null or Boolean value or classifies a source element
              * as containing the {@code eval} identifier name.
              * @param {string} sIdentifier The identifier encountered.
              */
             'name': function(sIdentifier) {
               if (-1 !== A_OTHER_SUBSTITUTABLE_LITERALS.indexOf(sIdentifier)) {
                 fCountPrimaryExpression(
                     EPrimaryExpressionCategories.N_NULL_AND_BOOLEAN_LITERALS,
                     EValuePrefixes.S_SYMBOLIC + sIdentifier);
               } else {
                 if ('eval' === sIdentifier) {
                   oSourceElementData.nCategory =
                       ESourceElementCategories.N_EVAL;
                 }
                 fAddIdentifier(sIdentifier);
               }
             },
             /**
              * Classifies the source element as excludable if it does not
              * contain a {@code with} statement or the {@code eval} identifier
              * name.
              * @param {TSyntacticCodeUnit} oExpression The expression whose
              *     value is to be returned.
              */
             'return': function(oExpression) {
               fClassifyAsExcludable();
             },
             /**
              * Increments the count of the number of occurrences of the
              * encountered String value.
              * @param {string} sStringValue The String value of the string
              *     literal encountered.
              */
             'string': function(sStringValue) {
               if (sStringValue.length > 0) {
                 fCountPrimaryExpression(
                     EPrimaryExpressionCategories.N_STRING_LITERALS,
                     EValuePrefixes.S_STRING + sStringValue);
               }
             },
             /**
              * Adds the identifier reserved for an exception to the list of
              * identifier names found.
              * @param {!TSyntacticCodeUnit} oTry A block of code in which an
              *     exception can occur.
              * @param {Array} aCatch The identifier reserved for an exception
              *     and a block of code to handle the exception.
              * @param {TSyntacticCodeUnit} oFinally An optional block of code
              *     to be evaluated regardless of whether an exception occurs.
              */
             'try': function(oTry, aCatch, oFinally) {
               if (Array.isArray(aCatch)) {
                 fAddIdentifier(aCatch[0]);
               }
             },
             /**
              * Classifies the source element as excludable if it does not
              * contain a {@code with} statement or the {@code eval} identifier
              * name. Adds the identifier of each declared variable to the list
              * of identifier names found.
              * @param {!Array.<!Array>} aVariableDeclarationList Variable
              *     declarations.
              */
             'var': function(aVariableDeclarationList) {
               fClassifyAsExcludable();
               aVariableDeclarationList.forEach(fAddVariable);
             },
             /**
              * Classifies a source element as containing the {@code with}
              * statement.
              * @param {!TSyntacticCodeUnit} oExpression An expression whose
              *     value is to be converted to a value of type Object and
              *     become the binding object of a new object environment
              *     record of a new lexical environment in which the statement
              *     is to be executed.
              * @param {!TSyntacticCodeUnit} oStatement The statement to be
              *     executed in the augmented lexical environment.
              * @return {!Array} An empty array to stop the traversal.
              */
             'with': function(oExpression, oStatement) {
               oSourceElementData.nCategory = ESourceElementCategories.N_WITH;
               return [];
             }
             /**#nocode-*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
           },
           /**
            * A collection of functions used while looking for nested functions.
            * @namespace
            * @type {!Object.<string, function(...[*])>}
            */
           oExamineFunctions: {
             /**#nocode+*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
             /**
              * Orders an examination of a nested function declaration.
              * @this {!TSyntacticCodeUnit} An array-like object representing
              *     the branch of an <abbr title="abstract syntax tree"
              *     >AST</abbr> representing the syntactic code unit along with
              *     its scope.
              * @return {!Array} An empty array to stop the traversal.
              */
             'defun': function() {
               fExamineSyntacticCodeUnit(this);
               return [];
             },
             /**
              * Orders an examination of a nested function expression.
              * @this {!TSyntacticCodeUnit} An array-like object representing
              *     the branch of an <abbr title="abstract syntax tree"
              *     >AST</abbr> representing the syntactic code unit along with
              *     its scope.
              * @return {!Array} An empty array to stop the traversal.
              */
             'function': function() {
               fExamineSyntacticCodeUnit(this);
               return [];
             }
             /**#nocode-*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
           }
         },
         /**
          * Records containing data about source elements.
          * @type {Array.<TSourceElementsData>}
          */
         aSourceElementsData = [],
         /**
          * The index (in the source text order) of the source element
          * immediately following a <a href="http://es5.github.com/#x14.1"
          * >Directive Prologue</a>.
          * @type {number}
          */
         nAfterDirectivePrologue = 0,
         /**
          * The index (in the source text order) of the source element that is
          * currently being considered.
          * @type {number}
          */
         nPosition,
         /**
          * The index (in the source text order) of the source element that is
          * the last element of the range of source elements that is currently
          * being considered.
          * @type {(undefined|number)}
          */
         nTo,
         /**
          * Initiates the traversal of a source element.
          * @param {!TWalker} oWalker An instance of an object that allows the
          *     traversal of an abstract syntax tree.
          * @param {!TSyntacticCodeUnit} oSourceElement A source element from
          *     which the traversal should commence.
          * @return {function(): !TSyntacticCodeUnit} A function that is able to
          *     initiate the traversal from a given source element.
          */
         cContext = function(oWalker, oSourceElement) {
           /**
            * @return {!TSyntacticCodeUnit} A function that is able to
            *     initiate the traversal from a given source element.
            */
           var fLambda = function() {
             return oWalker.walk(oSourceElement);
           };

           return fLambda;
         },
         /**
          * Classifies the source element as excludable if it does not
          * contain a {@code with} statement or the {@code eval} identifier
          * name.
          */
         fClassifyAsExcludable = function() {
           if (oSourceElementData.nCategory ===
               ESourceElementCategories.N_OTHER) {
             oSourceElementData.nCategory =
                 ESourceElementCategories.N_EXCLUDABLE;
           }
         },
         /**
          * Adds an identifier to the list of identifier names found.
          * @param {string} sIdentifier The identifier to be added.
          */
         fAddIdentifier = function(sIdentifier) {
           if (-1 === oSourceElementData.aIdentifiers.indexOf(sIdentifier)) {
             oSourceElementData.aIdentifiers.push(sIdentifier);
           }
         },
         /**
          * Adds the identifier of a variable to the list of identifier names
          * found.
          * @param {!Array} aVariableDeclaration A variable declaration.
          */
         fAddVariable = function(aVariableDeclaration) {
           fAddIdentifier(/** @type {string} */ aVariableDeclaration[0]);
         },
         /**
          * Increments the count of the number of occurrences of the prefixed
          * String representation attributed to the primary expression.
          * @param {number} nCategory The category of the primary expression.
          * @param {string} sName The prefixed String representation attributed
          *     to the primary expression.
          */
         fCountPrimaryExpression = function(nCategory, sName) {
           if (!oSourceElementData.aCount[nCategory].hasOwnProperty(sName)) {
             oSourceElementData.aCount[nCategory][sName] = 0;
             if (-1 === oSourceElementData.aPrimitiveValues.indexOf(sName)) {
               oSourceElementData.aPrimitiveValues.push(sName);
             }
           }
           oSourceElementData.aCount[nCategory][sName] += 1;
         },
         /**
          * Consolidates all worthwhile primitive values in a range of source
          *     elements.
          * @param {number} nFrom The index (in the source text order) of the
          *     source element that is the first element of the range.
          * @param {number} nTo The index (in the source text order) of the
          *     source element that is the last element of the range.
          * @param {boolean} bEnclose Indicates whether the range should be
          *     enclosed within a function call with no argument values to a
          *     function with an empty parameter list if any primitive values
          *     are consolidated.
          * @see TPrimitiveValue#nSaving
          */
         fExamineSourceElements = function(nFrom, nTo, bEnclose) {
           var _,
               /**
                * The index of the last mangled name.
                * @type {number}
                */
               nIndex = oScope.cname,
               /**
                * The index of the source element that is currently being
                * considered.
                * @type {number}
                */
               nPosition,
               /**
                * A collection of functions used during the consolidation of
                * primitive values and identifier names used as property
                * accessors.
                * @namespace
                * @type {!Object.<string, function(...[*])>}
                */
               oWalkersTransformers = {
                 /**
                  * If the String value that is equivalent to the sequence of
                  * terminal symbols that constitute the encountered identifier
                  * name is worthwhile, a syntactic conversion from the dot
                  * notation to the bracket notation ensues with that sequence
                  * being substituted by an identifier name to which the value
                  * is assigned.
                  * Applies to property accessors that use the dot notation.
                  * @param {!TSyntacticCodeUnit} oExpression The nonterminal
                  *     MemberExpression.
                  * @param {string} sIdentifierName The identifier name used as
                  *     the property accessor.
                  * @return {!Array} A syntactic code unit that is equivalent to
                  *     the one encountered.
                  * @see TPrimitiveValue#nSaving
                  */
                 'dot': function(oExpression, sIdentifierName) {
                   /**
                    * The prefixed String value that is equivalent to the
                    * sequence of terminal symbols that constitute the
                    * encountered identifier name.
                    * @type {string}
                    */
                   var sPrefixed = EValuePrefixes.S_STRING + sIdentifierName;

                   return oSolutionBest.oPrimitiveValues.hasOwnProperty(
                       sPrefixed) &&
                       oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0 ?
                       ['sub',
                        oWalker.walk(oExpression),
                        ['name',
                         oSolutionBest.oPrimitiveValues[sPrefixed].sName]] :
                       ['dot', oWalker.walk(oExpression), sIdentifierName];
                 },
                 /**
                  * If the encountered identifier is a null or Boolean literal
                  * and its value is worthwhile, the identifier is substituted
                  * by an identifier name to which that value is assigned.
                  * Applies to identifier names.
                  * @param {string} sIdentifier The identifier encountered.
                  * @return {!Array} A syntactic code unit that is equivalent to
                  *     the one encountered.
                  * @see TPrimitiveValue#nSaving
                  */
                 'name': function(sIdentifier) {
                   /**
                    * The prefixed representation String of the identifier.
                    * @type {string}
                    */
                   var sPrefixed = EValuePrefixes.S_SYMBOLIC + sIdentifier;

                   return [
                     'name',
                     oSolutionBest.oPrimitiveValues.hasOwnProperty(sPrefixed) &&
                     oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0 ?
                     oSolutionBest.oPrimitiveValues[sPrefixed].sName :
                     sIdentifier
                   ];
                 },
                 /**
                  * If the encountered String value is worthwhile, it is
                  * substituted by an identifier name to which that value is
                  * assigned.
                  * Applies to String values.
                  * @param {string} sStringValue The String value of the string
                  *     literal encountered.
                  * @return {!Array} A syntactic code unit that is equivalent to
                  *     the one encountered.
                  * @see TPrimitiveValue#nSaving
                  */
                 'string': function(sStringValue) {
                   /**
                    * The prefixed representation String of the primitive value
                    * of the literal.
                    * @type {string}
                    */
                   var sPrefixed =
                       EValuePrefixes.S_STRING + sStringValue;

                   return oSolutionBest.oPrimitiveValues.hasOwnProperty(
                       sPrefixed) &&
                       oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0 ?
                       ['name',
                        oSolutionBest.oPrimitiveValues[sPrefixed].sName] :
                       ['string', sStringValue];
                 }
               },
               /**
                * Such data on what to consolidate within the range of source
                * elements that is currently being considered that lead to the
                * greatest known reduction of the number of the terminal symbols
                * in comparison to the original source text.
                * @type {!TSolution}
                */
               oSolutionBest = new TSolution(),
               /**
                * Data representing an ongoing attempt to find a better
                * reduction of the number of the terminal symbols in comparison
                * to the original source text than the best one that is
                * currently known.
                * @type {!TSolution}
                * @see oSolutionBest
                */
               oSolutionCandidate = new TSolution(),
               /**
                * A record consisting of data about the range of source elements
                * that is currently being examined.
                * @type {!TSourceElementsData}
                */
               oSourceElementsData = new TSourceElementsData(),
               /**
                * Variable declarations for each primitive value that is to be
                * consolidated within the elements.
                * @type {!Array.<!Array>}
                */
               aVariableDeclarations = [],
               /**
                * Augments a list with a prefixed representation String.
                * @param {!Array.<string>} aList A list that is to be augmented.
                * @return {function(string)} A function that augments a list
                *     with a prefixed representation String.
                */
               cAugmentList = function(aList) {
                 /**
                  * @param {string} sPrefixed Prefixed representation String of
                  *     a primitive value that could be consolidated within the
                  *     elements.
                  */
                 var fLambda = function(sPrefixed) {
                   if (-1 === aList.indexOf(sPrefixed)) {
                     aList.push(sPrefixed);
                   }
                 };

                 return fLambda;
               },
               /**
                * Adds the number of occurrences of a primitive value of a given
                * category that could be consolidated in the source element with
                * a given index to the count of occurrences of that primitive
                * value within the range of source elements that is currently
                * being considered.
                * @param {number} nPosition The index (in the source text order)
                *     of a source element.
                * @param {number} nCategory The category of the primary
                *     expression from which the primitive value is derived.
                * @return {function(string)} A function that performs the
                *     addition.
                * @see cAddOccurrencesInCategory
                */
               cAddOccurrences = function(nPosition, nCategory) {
                 /**
                  * @param {string} sPrefixed The prefixed representation String
                  *     of a primitive value.
                  */
                 var fLambda = function(sPrefixed) {
                   if (!oSourceElementsData.aCount[nCategory].hasOwnProperty(
                           sPrefixed)) {
                     oSourceElementsData.aCount[nCategory][sPrefixed] = 0;
                   }
                   oSourceElementsData.aCount[nCategory][sPrefixed] +=
                       aSourceElementsData[nPosition].aCount[nCategory][
                           sPrefixed];
                 };

                 return fLambda;
               },
               /**
                * Adds the number of occurrences of each primitive value of a
                * given category that could be consolidated in the source
                * element with a given index to the count of occurrences of that
                * primitive values within the range of source elements that is
                * currently being considered.
                * @param {number} nPosition The index (in the source text order)
                *     of a source element.
                * @return {function(number)} A function that performs the
                *     addition.
                * @see fAddOccurrences
                */
               cAddOccurrencesInCategory = function(nPosition) {
                 /**
                  * @param {number} nCategory The category of the primary
                  *     expression from which the primitive value is derived.
                  */
                 var fLambda = function(nCategory) {
                   Object.keys(
                       aSourceElementsData[nPosition].aCount[nCategory]
                   ).forEach(cAddOccurrences(nPosition, nCategory));
                 };

                 return fLambda;
               },
               /**
                * Adds the number of occurrences of each primitive value that
                * could be consolidated in the source element with a given index
                * to the count of occurrences of that primitive values within
                * the range of source elements that is currently being
                * considered.
                * @param {number} nPosition The index (in the source text order)
                *     of a source element.
                */
               fAddOccurrences = function(nPosition) {
                 Object.keys(aSourceElementsData[nPosition].aCount).forEach(
                     cAddOccurrencesInCategory(nPosition));
               },
               /**
                * Creates a variable declaration for a primitive value if that
                * primitive value is to be consolidated within the elements.
                * @param {string} sPrefixed Prefixed representation String of a
                *     primitive value that could be consolidated within the
                *     elements.
                * @see aVariableDeclarations
                */
               cAugmentVariableDeclarations = function(sPrefixed) {
                 if (oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0) {
                   aVariableDeclarations.push([
                     oSolutionBest.oPrimitiveValues[sPrefixed].sName,
                     [0 === sPrefixed.indexOf(EValuePrefixes.S_SYMBOLIC) ?
                      'name' : 'string',
                      sPrefixed.substring(EValuePrefixes.S_SYMBOLIC.length)]
                   ]);
                 }
               },
               /**
                * Sorts primitive values with regard to the difference in the
                * number of terminal symbols between the original source text
                * and the one with those primitive values consolidated.
                * @param {string} sPrefixed0 The prefixed representation String
                *     of the first of the two primitive values that are being
                *     compared.
                * @param {string} sPrefixed1 The prefixed representation String
                *     of the second of the two primitive values that are being
                *     compared.
                * @return {number}
                *     <dl>
                *         <dt>-1</dt>
                *         <dd>if the first primitive value must be placed before
                *              the other one,</dd>
                *         <dt>0</dt>
                *         <dd>if the first primitive value may be placed before
                *              the other one,</dd>
                *         <dt>1</dt>
                *         <dd>if the first primitive value must not be placed
                *              before the other one.</dd>
                *     </dl>
                * @see TSolution.oPrimitiveValues
                */
               cSortPrimitiveValues = function(sPrefixed0, sPrefixed1) {
                 /**
                  * The difference between:
                  * <ol>
                  * <li>the difference in the number of terminal symbols
                  *     between the original source text and the one with the
                  *     first primitive value consolidated, and</li>
                  * <li>the difference in the number of terminal symbols
                  *     between the original source text and the one with the
                  *     second primitive value consolidated.</li>
                  * </ol>
                  * @type {number}
                  */
                 var nDifference =
                     oSolutionCandidate.oPrimitiveValues[sPrefixed0].nSaving -
                     oSolutionCandidate.oPrimitiveValues[sPrefixed1].nSaving;

                 return nDifference > 0 ? -1 : nDifference < 0 ? 1 : 0;
               },
               /**
                * Assigns an identifier name to a primitive value and calculates
                * whether instances of that primitive value are worth
                * consolidating.
                * @param {string} sPrefixed The prefixed representation String
                *     of a primitive value that is being evaluated.
                */
               fEvaluatePrimitiveValue = function(sPrefixed) {
                 var _,
                     /**
                      * The index of the last mangled name.
                      * @type {number}
                      */
                     nIndex,
                     /**
                      * The representation String of the primitive value that is
                      * being evaluated.
                      * @type {string}
                      */
                     sName =
                         sPrefixed.substring(EValuePrefixes.S_SYMBOLIC.length),
                     /**
                      * The number of source characters taken up by the
                      * representation String of the primitive value that is
                      * being evaluated.
                      * @type {number}
                      */
                     nLengthOriginal = sName.length,
                     /**
                      * The number of source characters taken up by the
                      * identifier name that could substitute the primitive
                      * value that is being evaluated.
                      * substituted.
                      * @type {number}
                      */
                     nLengthSubstitution,
                     /**
                      * The number of source characters taken up by by the
                      * representation String of the primitive value that is
                      * being evaluated when it is represented by a string
                      * literal.
                      * @type {number}
                      */
                     nLengthString = oProcessor.make_string(sName).length;

                 oSolutionCandidate.oPrimitiveValues[sPrefixed] =
                     new TPrimitiveValue();
                 do {  // Find an identifier unused in this or any nested scope.
                   nIndex = oScope.cname;
                   oSolutionCandidate.oPrimitiveValues[sPrefixed].sName =
                       oScope.next_mangled();
                 } while (-1 !== oSourceElementsData.aIdentifiers.indexOf(
                     oSolutionCandidate.oPrimitiveValues[sPrefixed].sName));
                 nLengthSubstitution = oSolutionCandidate.oPrimitiveValues[
                     sPrefixed].sName.length;
                 if (0 === sPrefixed.indexOf(EValuePrefixes.S_SYMBOLIC)) {
                   // foo:null, or foo:null;
                   oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving -=
                       nLengthSubstitution + nLengthOriginal +
                       oWeights.N_VARIABLE_DECLARATION;
                   // null vs foo
                   oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving +=
                       oSourceElementsData.aCount[
                           EPrimaryExpressionCategories.
                               N_NULL_AND_BOOLEAN_LITERALS][sPrefixed] *
                       (nLengthOriginal - nLengthSubstitution);
                 } else {
                   // foo:'fromCharCode';
                   oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving -=
                       nLengthSubstitution + nLengthString +
                       oWeights.N_VARIABLE_DECLARATION;
                   // .fromCharCode vs [foo]
                   if (oSourceElementsData.aCount[
                           EPrimaryExpressionCategories.N_IDENTIFIER_NAMES
                       ].hasOwnProperty(sPrefixed)) {
                     oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving +=
                         oSourceElementsData.aCount[
                             EPrimaryExpressionCategories.N_IDENTIFIER_NAMES
                         ][sPrefixed] *
                         (nLengthOriginal - nLengthSubstitution -
                          oWeights.N_PROPERTY_ACCESSOR);
                   }
                   // 'fromCharCode' vs foo
                   if (oSourceElementsData.aCount[
                           EPrimaryExpressionCategories.N_STRING_LITERALS
                       ].hasOwnProperty(sPrefixed)) {
                     oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving +=
                         oSourceElementsData.aCount[
                             EPrimaryExpressionCategories.N_STRING_LITERALS
                         ][sPrefixed] *
                         (nLengthString - nLengthSubstitution);
                   }
                 }
                 if (oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving >
                     0) {
                   oSolutionCandidate.nSavings +=
                       oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving;
                 } else {
                   oScope.cname = nIndex; // Free the identifier name.
                 }
               },
               /**
                * Adds a variable declaration to an existing variable statement.
                * @param {!Array} aVariableDeclaration A variable declaration
                *     with an initialiser.
                */
               cAddVariableDeclaration = function(aVariableDeclaration) {
                 (/** @type {!Array} */ oSourceElements[nFrom][1]).unshift(
                     aVariableDeclaration);
               };

           if (nFrom > nTo) {
             return;
           }
           // If the range is a closure, reuse the closure.
           if (nFrom === nTo &&
               'stat' === oSourceElements[nFrom][0] &&
               'call' === oSourceElements[nFrom][1][0] &&
               'function' === oSourceElements[nFrom][1][1][0]) {
             fExamineSyntacticCodeUnit(oSourceElements[nFrom][1][1]);
             return;
           }
           // Create a list of all derived primitive values within the range.
           for (nPosition = nFrom; nPosition <= nTo; nPosition += 1) {
             aSourceElementsData[nPosition].aPrimitiveValues.forEach(
                 cAugmentList(oSourceElementsData.aPrimitiveValues));
           }
           if (0 === oSourceElementsData.aPrimitiveValues.length) {
             return;
           }
           for (nPosition = nFrom; nPosition <= nTo; nPosition += 1) {
             // Add the number of occurrences to the total count.
             fAddOccurrences(nPosition);
             // Add identifiers of this or any nested scope to the list.
             aSourceElementsData[nPosition].aIdentifiers.forEach(
                 cAugmentList(oSourceElementsData.aIdentifiers));
           }
           // Distribute identifier names among derived primitive values.
           do {  // If there was any progress, find a better distribution.
             oSolutionBest = oSolutionCandidate;
             if (Object.keys(oSolutionCandidate.oPrimitiveValues).length > 0) {
               // Sort primitive values descending by their worthwhileness.
               oSourceElementsData.aPrimitiveValues.sort(cSortPrimitiveValues);
             }
             oSolutionCandidate = new TSolution();
             oSourceElementsData.aPrimitiveValues.forEach(
                 fEvaluatePrimitiveValue);
             oScope.cname = nIndex;
           } while (oSolutionCandidate.nSavings > oSolutionBest.nSavings);
           // Take the necessity of adding a variable statement into account.
           if ('var' !== oSourceElements[nFrom][0]) {
             oSolutionBest.nSavings -= oWeights.N_VARIABLE_STATEMENT_AFFIXATION;
           }
           if (bEnclose) {
             // Take the necessity of forming a closure into account.
             oSolutionBest.nSavings -= oWeights.N_CLOSURE;
           }
           if (oSolutionBest.nSavings > 0) {
             // Create variable declarations suitable for UglifyJS.
             Object.keys(oSolutionBest.oPrimitiveValues).forEach(
                 cAugmentVariableDeclarations);
             // Rewrite expressions that contain worthwhile primitive values.
             for (nPosition = nFrom; nPosition <= nTo; nPosition += 1) {
               oWalker = oProcessor.ast_walker();
               oSourceElements[nPosition] =
                   oWalker.with_walkers(
                       oWalkersTransformers,
                       cContext(oWalker, oSourceElements[nPosition]));
             }
             if ('var' === oSourceElements[nFrom][0]) {  // Reuse the statement.
               (/** @type {!Array.<!Array>} */ aVariableDeclarations.reverse(
                   )).forEach(cAddVariableDeclaration);
             } else {  // Add a variable statement.
               Array.prototype.splice.call(
                   oSourceElements,
                   nFrom,
                   0,
                   ['var', aVariableDeclarations]);
               nTo += 1;
             }
             if (bEnclose) {
               // Add a closure.
               Array.prototype.splice.call(
                   oSourceElements,
                   nFrom,
                   0,
                   ['stat', ['call', ['function', null, [], []], []]]);
               // Copy source elements into the closure.
               for (nPosition = nTo + 1; nPosition > nFrom; nPosition -= 1) {
                 Array.prototype.unshift.call(
                     oSourceElements[nFrom][1][1][3],
                     oSourceElements[nPosition]);
               }
               // Remove source elements outside the closure.
               Array.prototype.splice.call(
                   oSourceElements,
                   nFrom + 1,
                   nTo - nFrom + 1);
             }
           }
           if (bEnclose) {
             // Restore the availability of identifier names.
             oScope.cname = nIndex;
           }
         };

     oSourceElements = (/** @type {!TSyntacticCodeUnit} */
         oSyntacticCodeUnit[bIsGlobal ? 1 : 3]);
     if (0 === oSourceElements.length) {
       return;
     }
     oScope = bIsGlobal ? oSyntacticCodeUnit.scope : oSourceElements.scope;
     // Skip a Directive Prologue.
     while (nAfterDirectivePrologue < oSourceElements.length &&
            'directive' === oSourceElements[nAfterDirectivePrologue][0]) {
       nAfterDirectivePrologue += 1;
       aSourceElementsData.push(null);
     }
     if (oSourceElements.length === nAfterDirectivePrologue) {
       return;
     }
     for (nPosition = nAfterDirectivePrologue;
          nPosition < oSourceElements.length;
          nPosition += 1) {
       oSourceElementData = new TSourceElementsData();
       oWalker = oProcessor.ast_walker();
       // Classify a source element.
       // Find its derived primitive values and count their occurrences.
       // Find all identifiers used (including nested scopes).
       oWalker.with_walkers(
           oWalkers.oSurveySourceElement,
           cContext(oWalker, oSourceElements[nPosition]));
       // Establish whether the scope is still wholly examinable.
       bIsWhollyExaminable = bIsWhollyExaminable &&
           ESourceElementCategories.N_WITH !== oSourceElementData.nCategory &&
           ESourceElementCategories.N_EVAL !== oSourceElementData.nCategory;
       aSourceElementsData.push(oSourceElementData);
     }
     if (bIsWhollyExaminable) {  // Examine the whole scope.
       fExamineSourceElements(
           nAfterDirectivePrologue,
           oSourceElements.length - 1,
           false);
     } else {  // Examine unexcluded ranges of source elements.
       for (nPosition = oSourceElements.length - 1;
            nPosition >= nAfterDirectivePrologue;
            nPosition -= 1) {
         oSourceElementData = (/** @type {!TSourceElementsData} */
             aSourceElementsData[nPosition]);
         if (ESourceElementCategories.N_OTHER ===
             oSourceElementData.nCategory) {
           if ('undefined' === typeof nTo) {
             nTo = nPosition;  // Indicate the end of a range.
           }
           // Examine the range if it immediately follows a Directive Prologue.
           if (nPosition === nAfterDirectivePrologue) {
             fExamineSourceElements(nPosition, nTo, true);
           }
         } else {
           if ('undefined' !== typeof nTo) {
             // Examine the range that immediately follows this source element.
             fExamineSourceElements(nPosition + 1, nTo, true);
             nTo = void 0;  // Obliterate the range.
           }
           // Examine nested functions.
           oWalker = oProcessor.ast_walker();
           oWalker.with_walkers(
               oWalkers.oExamineFunctions,
               cContext(oWalker, oSourceElements[nPosition]));
         }
       }
     }
   }(oAbstractSyntaxTree = oProcessor.ast_add_scope(oAbstractSyntaxTree)));
  return oAbstractSyntaxTree;
};
/*jshint sub:false */

/* Local Variables:      */
/* mode: js              */
/* coding: utf-8         */
/* indent-tabs-mode: nil */
/* tab-width: 2          */
/* End:                  */
/* vim: set ft=javascript fenc=utf-8 et ts=2 sts=2 sw=2: */
/* :mode=javascript:noTabs=true:tabSize=2:indentSize=2:deepIndent=true: */


});

require.define("/lib/parser/codeGenerator.js",function(require,module,exports,__dirname,__filename,process,global){var cg = require('../codeGenerator');

exports.codeGenerator = function () {
  var codegen = {};

  var term = require('../terms/terms')(codegen);

  var importTerm = function (name) {
    importModule('../terms/' + name);
  };

  var importModule = function (path) {
    var name = /[^/]*$/.exec(path)[0];
    codegen[name] = require(path)(codegen);
  };
  
  codegen.term = term.term;
  codegen.termPrototype = term.termPrototype;
  codegen.moduleConstants = new (require('../moduleConstants')(codegen));
  importTerm('generatedVariable');
  importTerm('definition');
  importTerm('javascript');
  codegen.basicExpression = require('./basicExpression');
  importTerm('splatArguments');
  importTerm('variable');
  importTerm('selfExpression');
  importTerm('statements');
  importTerm('asyncStatements');
  importTerm('subStatements');
  importTerm('closure');
  importTerm('normalParameters');
  importTerm('splatParameters');
  codegen.block = codegen.closure;
  importTerm('parameters');
  importTerm('identifier');
  importTerm('integer');
  importTerm('float');
  codegen.normaliseString = cg.normaliseString;
  codegen.unindent = cg.unindent;
  codegen.normaliseInterpolatedString = cg.normaliseInterpolatedString;
  importTerm('string');
  importTerm('interpolatedString');
  codegen.normaliseRegExp = cg.normaliseRegExp;
  importTerm('regExp');
  codegen.parseRegExp = cg.parseRegExp;
  importTerm('module');
  codegen.interpolation = cg.interpolation;
  importTerm('list');
  codegen.normaliseArguments = cg.normaliseArguments;
  importTerm('argumentList');
  importTerm('subExpression');
  importTerm('fieldReference');
  importTerm('hash');
  importTerm('asyncArgument');
  codegen.complexExpression = require('./complexExpression');
  codegen.operatorExpression = require('../parser/operatorExpression')(codegen);
  codegen.unaryOperatorExpression = require('../parser/unaryOperatorExpression')(codegen);
  importTerm('operator');
  importTerm('splat');
  importTerm('hashEntry');
  codegen.concatName = cg.concatName;
  codegen.parseSplatParameters = cg.parseSplatParameters;
  codegen.collapse = cg.collapse;
  importTerm('functionCall');
  importTerm('scope');
  codegen.SymbolScope = require('../symbolScope').SymbolScope;
  importModule('../macroDirectory');
  importTerm('boolean');
  importTerm('increment');
  codegen.typeof = require('../terms/typeof').typeof;
  importTerm('tryExpression');
  importTerm('ifExpression');
  importTerm('nil');
  importTerm('continueStatement');
  importTerm('breakStatement');
  importTerm('throwStatement');
  importTerm('returnStatement');
  importTerm('methodCall');
  importTerm('asyncResult');
  importTerm('indexer');
  importTerm('whileExpression');
  codegen.whileStatement = codegen.whileExpression;
  importTerm('withExpression');
  codegen.withStatement = codegen.withExpression;
  importTerm('forExpression');
  codegen.forStatement = codegen.forExpression;
  importTerm('forIn');
  importTerm('forEach');
  importTerm('newOperator');
  codegen.loc = loc;
  importTerm('asyncCallback');
  codegen.callbackFunction = codegen.variable(['continuation'], {couldBeMacro: false});
  codegen.callbackFunction.isContinuation = true;
  codegen.optional = cg.optional;
  codegen.postIncrement = cg.postIncrement;
  codegen.oldTerm = cg.oldTerm;
  importTerm('semanticError');
  codegen.errors = require('./errors').errors(codegen);
  codegen.macros = require('./macros').macros(codegen);
  codegen.listMacros = require('./listMacros')(codegen);
  importTerm('argumentUtils');
  importTerm('closureParameterStrategies');
  
  return codegen;
};

var loc = function (term, location) {
  var loc = {
    firstLine: location.first_line,
    lastLine: location.last_line,
    firstColumn: location.first_column,
    lastColumn: location.last_column
  };

  term.location = function () {
    return loc;
  };
  
  return term;
};

});

require.define("/lib/parser/basicExpression.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

module.exports = function (terminals) {
  var cg = this;
  return cg.oldTerm(function () {
    this.terminals = terminals;
    this.subterms('terminals');
    
    this.hasName = function () {
      return this.name().length > 0;
    };
    
    this.isCall = function () {
      if (this.hasName()) {
        return this.hasArguments();
      } else {
        return this.terminals.length > 1;
      }
    };
    
    this.name = function () {
      return this._name || (this._name = _(this.terminals).filter(function (terminal) {
        return terminal.identifier;
      }).map(function (identifier) {
        return identifier.identifier;
      }));
    };
    
    this.hasAsyncArgument = function () {
      return this._hasAsyncArgument || (this._hasAsyncArgument =
        _.any(this.terminals, function (t) { return t.isAsyncArgument; })
      );
    };
    
    this.hasArguments = function () {
      return this._hasArguments || (this._hasArguments =
        this.argumentTerminals().length > 0
      );
    };
    
    this.argumentTerminals = function() {
      if (this._argumentTerminals) {
        return this._argumentTerminals;
      } else {
        this._buildBlocks();
        return this._argumentTerminals =
          _.compact(_.map(this.terminals, function (terminal) {
            return terminal.arguments();
          }));
      }
    };

    this.arguments = function() {
      return this._arguments || (this._arguments = _.flatten(this.argumentTerminals()));
    };

    this.parameters = function (options) {
			var skipFirstParameter = options && options.skipFirstParameter;
	
      if (this._parameters) {
        return this._parameters;
      }
      
      var args = _(this.arguments()).filter(function (a) {
        return !a.isHashEntry;
      });

			if (skipFirstParameter) {
				args = args.slice(1);
			}

      return this._parameters = _(args).map(function (arg) {
        return arg.parameter();
      });
    };
    
    this.optionalParameters = function () {
      if (this._optionalParameters) {
        return this._optionalParameters;
      }
      
      var args = _(this.arguments()).filter(function (a) {
        return a.isHashEntry;
      });

      return this._optionalParameters = args;
    };
    
    this.hasParameters = function () {
      return this._hasParameters || (this._hasParameters =
        this.argumentTerminals().length > 0
      );
    };
    
    this._buildBlocks = function () {
      var parameters = [];

      _(this.terminals).each(function (terminal) {
        if (terminal.isParameters) {
          parameters.push.apply(parameters, terminal.parameters);
        } else if (terminal.isBlock) {
          terminal.parameters = parameters;
          parameters = [];
        }
      });
      
      _(parameters).each(function (parm) {
        cg.errors.addTermWithMessage(parm, 'block parameter with no block');
      });
    };
    
    this.hashEntry = function (options) {
      var withoutBlock = options && options.withoutBlock;
      
      var args = this.arguments();
      var name = this.name();
      
      if (withoutBlock && args.length > 0 && args[args.length - 1].isBlock) {
        args = args.slice(0, args.length - 1);
      }

      if (name.length > 0 && args.length === 1) {
        return cg.hashEntry(name, args[0]);
      }

      if (name.length > 0 && args.length === 0) {
        return cg.hashEntry(name);
      }
      
      if (name.length === 0 && args.length === 2 && args[0].isString) {
        return cg.hashEntry(args[0], args[1])
      }
      
      return cg.errors.addTermWithMessage(this, 'cannot be a hash entry');
    };
    
    this.hashEntryBlock = function () {
      var args = this.arguments();
      
      var lastArgument = args[args.length - 1];
      
      if (lastArgument && lastArgument.isBlock) {
        return lastArgument;
      }
    };
    
    this.hashKey = function () {
      var args = this.arguments();
      if (args.length === 1 && args[0].isString) {
        return args[0];
      } else if (!this.hasParameters() && !this.hasArguments() && this.hasName()) {
        return this.name();
      } else {
        return cg.errors.addTermWithMessage(this, 'cannot be a hash key');
      }
    }
  });
};

});

require.define("/lib/parser/complexExpression.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

module.exports = function (listOfTerminals) {
  var cg = this;
  return cg.oldTerm(function () {
    this.isComplexExpression = true;
    this.basicExpressions = _(listOfTerminals).map(function (terminals) {
      return cg.basicExpression(terminals);
    });
    
    this.subterms('basicExpressions');

    this.head = function () {
      return this._firstExpression || (this._firstExpression = this.basicExpressions[0]);
    };
    
    this.tail = function () {
      return this._tail || (this._tail = this.basicExpressions.slice(1));
    };
    
    this.hasTail = function () {
      return this.tail().length > 0;
    };
    
    this.optionalArguments = function () {
      if (this._optionalArguments) {
        return this._optionalArguments;
      } else {
        var tail = this.tail();
        var tailLength = tail.length;
        var n = 0;
        
        return this._optionalArguments = _(tail).map(function (e) {
          n++;
          return e.hashEntry({withoutBlock: n === tailLength});
        }).concat(_(this.head().arguments()).filter(function (a) {
          return a.isHashEntry;
        }));
      }
    };

    this.hasAsyncArgument = function () {
      return this.head().hasAsyncArgument();
    };
    
    this.tailBlock = function () {
      if (this._hasTailBlock) {
        return this._tailBlock;
      } else {
        var tail = this.tail();
        if (tail.length > 0) {
          var block = tail[tail.length - 1].hashEntryBlock();
          
          this._hasTailBlock = block;
          return this._tailBlock = block;
        } else {
          this._hasTailBlock = false;
          this._tailBlock = undefined;
        }
      }
    }
    
    this.arguments = function () {
      if (this._arguments) {
        return this._arguments;
      } else {
        var args = _(this.head().arguments()).filter(function (a) {
          return !a.isHashEntry;
        });
        
        var tailBlock = this.tailBlock();
        
        if (tailBlock) {
          return this._arguments = args.concat(tailBlock);
        } else {
          return this._arguments = args;
        }
      }
    }
    
    this.hasArguments = function () {
      return this._hasArguments || (this._hasArguments = 
        this.head().hasArguments() || (this.optionalArguments().length > 0) || this.tailBlock()
      );
    };
    
    this.expression = function () {
      var head = this.head();

      if (head.hasName()) {
        if (this.hasArguments()) {
          return cg.functionCall(cg.variable(head.name(), {couldBeMacro: false, location: this.location()}), this.arguments(), {optionalArguments: this.optionalArguments(), async: this.hasAsyncArgument()});
        } else {
          return cg.variable(head.name(), {location: this.location()});
        }
      } else {
        if (!this.hasTail() && this.arguments().length === 1 && !this.hasAsyncArgument()) {
          return this.arguments()[0];
        } else {
          return cg.functionCall(this.arguments()[0], this.arguments().slice(1), {async: this.hasAsyncArgument()});
        }
      }
    };
    
    this.objectOperationExpression = function (object) {
      var head = this.head();

      if (head.hasName()) {
        if (this.hasArguments()) {
          return cg.methodCall(object, head.name(), this.arguments(), {optionalArguments: this.optionalArguments(), async: this.hasAsyncArgument()});
        } else {
          return cg.fieldReference(object, head.name());
        }
      } else {
        if (!this.hasTail() && !head.isCall() && !this.hasAsyncArgument()) {
          return cg.indexer(object, this.arguments()[0]);
        } else {
          return cg.functionCall(cg.indexer(object, this.arguments()[0]), this.arguments().slice(1), {async: this.hasAsyncArgument()});
        }
      }
    };
    
    this.parameters = function (options) {
      return this.head().parameters(options);
    };
    
    this.optionalParameters = function () {
      return this.optionalArguments();
    };
    
    this.hasParameters = function () {
      return this._hasParameters || (this._hasParameters =
        this.head().hasParameters() || this.optionalParameters().length > 0
      );
    };
    
    this.hashEntry = function () {
      if (this.hasTail()) {
        return cg.errors.addTermsWithMessage(this.tail(), 'cannot be used in hash entry');
      }
      return this.head().hashEntry();
    };
    
    this.objectOperationDefinition = function (object, source) {
      var self = this;
      
      return {
        expression: function () {
          if (self.head().hasName()) {
            if (self.hasParameters()) {
              var block = source.blockify(self.parameters(), {optionalParameters: self.optionalParameters(), async: self.hasAsyncArgument()});
              block.redefinesSelf = true;
              return cg.definition(cg.fieldReference(object, self.head().name()), block, {assignment: true});
            } else {
              return cg.definition(cg.fieldReference(object, self.head().name()), source.scopify(), {assignment: true});
            }
          } else {
            if (!self.hasTail() && self.arguments().length === 1 && !self.hasAsyncArgument()) {
              return cg.definition(cg.indexer(object, self.arguments()[0]), source.scopify(), {assignment: true});
            } else {
              var block = source.blockify(self.parameters({skipFirstParameter: true}), {optionalParameters: self.optionalParameters(), async: self.hasAsyncArgument()});
              block.redefinesSelf = true;
              return cg.definition(cg.indexer(object, self.arguments()[0]), block, {assignment: true});
            }
          }
        }
      };
    };
    
    this.objectOperation = function (object) {
      var complexExpression = this;
      
      return new function () {
        this.operation = complexExpression;
        this.object = object;
        
        this.expression = function () {
          return this.operation.objectOperationExpression(this.object);
        };
        
        this.definition = function (source) {
          return this.operation.objectOperationDefinition(this.object, source);
        };
      };
    };
    
    this.definition = function (source, options) {
      var self = this;
      var assignment = options && Object.hasOwnProperty.call(options, 'assignment') && options.assignment;
      
      if (self.head().hasName()) {
        if (self.hasParameters()) {
          return {
            expression: function () {
              return cg.definition(cg.variable(self.head().name(), {location: self.location()}), source.blockify(self.parameters(), {optionalParameters: self.optionalParameters(), async: self.hasAsyncArgument()}), {assignment: assignment});
            },
            hashEntry: function (isOptionalArgument) {
              var block = source.blockify(self.parameters(), {optionalParameters: self.optionalParameters(), async: self.hasAsyncArgument()});
              block.redefinesSelf = !isOptionalArgument;

              return cg.hashEntry(self.head().name(), block);
            }
          };
        } else {
          return {
            expression: function () {
              return cg.definition(cg.variable(self.head().name(), {location: self.location()}), source.scopify(), {assignment: assignment});
            },
            hashEntry: function () {
              return cg.hashEntry(self.head().hashKey(), source.scopify());
            }
          };
        }
      } else {
        return {
          hashEntry: function () {
            var head = self.head();
            return cg.hashEntry(head.hashKey(), source);
          }
        };
      }
    };
  });
};

});

require.define("/lib/parser/operatorExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _, codegenUtils;
    _ = require("underscore");
    codegenUtils = require("../terms/codegenUtils");
    module.exports = function(terms) {
        var self = this;
        var operatorStack, operatorsInDecreasingPrecedenceOrder, operatorTable, createOperatorCall;
        operatorStack = function() {
            var operators;
            operators = [];
            return {
                push: function(op, popped) {
                    var self = this;
                    popped = popped || [];
                    if (operators.length === 0) {
                        operators.unshift(op);
                        return popped;
                    } else if (!op.precedence || !operators[0].precedence) {
                        if (!op.precedence) {
                            throw new Error(op.name + " cannot be used with other operators");
                        } else if (!operators[0].precedence) {
                            throw new Error(operators[0].name + " cannot be used with other operators");
                        }
                    } else if (op.leftAssociative && op.precedence <= operators[0].precedence) {
                        popped.push(operators.shift());
                        return self.push(op, popped);
                    } else if (op.precedence < operators[0].precedence) {
                        popped.push(operators.shift());
                        return self.push(op, popped);
                    } else {
                        operators.unshift(op);
                        return popped;
                    }
                },
                pop: function() {
                    var self = this;
                    return operators;
                }
            };
        };
        operatorsInDecreasingPrecedenceOrder = function(opsString) {
            var opLines, precedence, operators, gen1_items, gen2_i, line, match, names, assoc, gen3_items, gen4_i, name;
            opLines = opsString.trim().split(/\n/);
            precedence = opLines.length + 1;
            operators = {};
            gen1_items = opLines;
            for (gen2_i = 0; gen2_i < gen1_items.length; ++gen2_i) {
                line = gen1_items[gen2_i];
                match = /\s*((\S+\s+)*)(left|right)/.exec(line);
                names = match[1].trim().split(/\s+/);
                assoc = match[3];
                --precedence;
                gen3_items = names;
                for (gen4_i = 0; gen4_i < gen3_items.length; ++gen4_i) {
                    name = gen3_items[gen4_i];
                    operators[name] = {
                        name: name,
                        leftAssociative: assoc === "left",
                        precedence: precedence
                    };
                }
            }
            return operators;
        };
        operatorTable = function() {
            var table;
            table = operatorsInDecreasingPrecedenceOrder("\n            / * % left\n            - + left\n            << >> >>> left\n            > >= < <= left\n            == != left\n            & left\n            ^ left\n            | left\n            && @and left\n            || @or left\n        ");
            return {
                findOp: function(op) {
                    var self = this;
                    if (table.hasOwnProperty(op)) {
                        return table[op];
                    } else {
                        return {
                            name: op
                        };
                    }
                }
            };
        }();
        createOperatorCall = function(name, arguments) {
            return terms.functionCall(name, arguments);
        };
        return terms.term({
            constructor: function(complexExpression) {
                var self = this;
                self.arguments = [ complexExpression ];
                return self.name = [];
            },
            addOperatorExpression: function(operator, expression) {
                var self = this;
                self.name.push(operator);
                return self.arguments.push(expression);
            },
            expression: function() {
                var self = this;
                var operands, operators, applyOperators, n, poppedOps;
                if (self.arguments.length > 1) {
                    operands = [ self.arguments[0].expression() ];
                    operators = operatorStack();
                    applyOperators = function(ops) {
                        var gen5_items, gen6_i, op, right, left, name;
                        gen5_items = ops;
                        for (gen6_i = 0; gen6_i < gen5_items.length; ++gen6_i) {
                            op = gen5_items[gen6_i];
                            right = operands.shift();
                            left = operands.shift();
                            name = terms.variable([ codegenUtils.normaliseOperatorName(op.name) ], {
                                couldBeMacro: false
                            });
                            operands.unshift(createOperatorCall(name, [ left, right ]));
                        }
                        return void 0;
                    };
                    for (n = 0; n < self.name.length; ++n) {
                        poppedOps = operators.push(operatorTable.findOp(self.name[n]));
                        applyOperators(poppedOps);
                        operands.unshift(self.arguments[n + 1].expression());
                    }
                    applyOperators(operators.pop());
                    return operands[0];
                } else {
                    return this.arguments[0].expression();
                }
            },
            hashEntry: function() {
                var self = this;
                if (this.arguments.length === 1) {
                    return this.arguments[0].hashEntry();
                } else {
                    return terms.errors.addTermWithMessage(self, "cannot be used as a hash entry");
                }
            },
            definition: function(source, gen7_options) {
                var self = this;
                var assignment;
                assignment = gen7_options !== void 0 && Object.prototype.hasOwnProperty.call(gen7_options, "assignment") && gen7_options.assignment !== void 0 ? gen7_options.assignment : false;
                var object, parms;
                if (this.arguments.length > 1) {
                    object = self.arguments[0].expression();
                    parms = function() {
                        var gen8_results, gen9_items, gen10_i, arg;
                        gen8_results = [];
                        gen9_items = self.arguments.slice(1);
                        for (gen10_i = 0; gen10_i < gen9_items.length; ++gen10_i) {
                            arg = gen9_items[gen10_i];
                            gen8_results.push(arg.expression().parameter());
                        }
                        return gen8_results;
                    }();
                    return terms.definition(terms.fieldReference(object, self.name), source.blockify(parms, []), {
                        assignment: assignment
                    });
                } else {
                    return this.arguments[0].definition(source, {
                        assignment: assignment
                    });
                }
            }
        });
    };
}).call(this);
});

require.define("/lib/parser/unaryOperatorExpression.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var codegenUtils;
    codegenUtils = require("../terms/codegenUtils");
    module.exports = function(terms) {
        var self = this;
        return terms.term({
            constructor: function(operator, expression) {
                var self = this;
                self.operator = operator;
                return self.expr = expression;
            },
            expression: function() {
                var self = this;
                var name, foundMacro;
                name = codegenUtils.normaliseOperatorName(self.operator);
                foundMacro = terms.macros.findMacro([ name ]);
                if (foundMacro) {
                    return foundMacro(self, [ self.operator ], [ self.expr ]);
                } else {
                    return terms.functionCall(terms.variable([ name ]), [ self.expr ]);
                }
            },
            hashEntry: function() {
                var self = this;
                return terms.errors.addTermWithMessage(self, "cannot be a hash entry");
            }
        });
    };
}).call(this);
});

require.define("/lib/parser/errors.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');

exports.errors = function (terms) {
  return new function () {
    this.errors = [];
  
    this.clear = function () {
      this.errors = [];
    };
  
    this.hasErrors = function () {
      return this.errors.length > 0;
    };
  
    this.printErrors = function (sourceFile, buffer) {
      _.each(this.errors, function (error) {
        error.printError(sourceFile, buffer);
      });
    };
  
    this.addTermWithMessage = function (term, message) {
      return this.addTermsWithMessage([term], message);
    };
  
    this.addTermsWithMessage = function (errorTerms, message) {
      var e = terms.semanticError (errorTerms, message);
      this.errors.push(e);
      return e;
    };
  };
};

});

require.define("/lib/parser/macros.js",function(require,module,exports,__dirname,__filename,process,global){var _ = require('underscore');
var errors = require('./errors.js');
var codegenUtils = require('../terms/codegenUtils');

exports.macros = function (cg) {
  var macros = cg.macroDirectory();

  var createOperator = function(term, name, args) {
    return cg.operator(name[0], args);
  };

  var javaScriptOperators = [
    '/',
    '-',
    '>=',
    '!=',
    '<=',
    '<',
    '>',
    '|',
    '&',
    '||',
    '&&',
    '!',
    '~',
    '--',
    '++',
    '%',
    '>>',
    '>>>',
    '<<',
    '^'
  ];

  _.each(javaScriptOperators, function(op) {
    macros.addMacro([op], createOperator);
  });

  macros.addMacro(['=='], function (term, name, args) {
    return cg.operator('===', args);
  });

  macros.addMacro(['!='], function (term, name, args) {
    return cg.operator('!==', args);
  });

  macros.addMacro(['in'], function (term, name, args) {
    return cg.operator('in', args);
  });

  var constructorType = function (constructor) {
    if (constructor.isVariable && constructor.variable.length == 1) {
      var constructorName = constructor.variable[0];

      switch (constructorName) {
        case "String":
          return "string";
        case "Number":
          return "number";
        case "Boolean":
          return "boolean";
      }
    }
  };

  macros.addMacro(['::'], function (term, name, args) {
    var type = constructorType(args[1]);

    if (type) {
      return cg.typeof (args[0], type);
    } else {
      return cg.operator('instanceof', args);
    }
  });

  var matchMultiOperator = function (name) {
    var firstOp = name[0];

    for (var n = 1; n < name.length; n++) {
      if (name[n] != firstOp) {
        return;
      }
    }

    return function (term, name, args) {
      return cg.operator(name[0], args);
    };
  };

  _.each(['+', '*'], function(op) {
    macros.addWildCardMacro([op], matchMultiOperator);
  });

  var createIfExpression = function(term, name, args) {
    var cases = [];
    var errorMsg = 'arguments to if else in are incorrect, try:\n\nif (condition)\n    then ()\nelse if (another condition)\n    do this ()\nelse\n    otherwise ()';

    if (args.length < 2) {
        return cg.errors.addTermWithMessage(term, errorMsg);
    }

    if ((name[name.length - 1] === 'else') !== (args.length % 2 === 1)) {
        return cg.errors.addTermWithMessage(term, errorMsg);
    }

    for (var n = 0; n + 1 < args.length; n += 2) {
      if (!isAny(args[n]) || !isClosureWithParameters(0)(args[n + 1])) {
        return cg.errors.addTermWithMessage(term, errorMsg);
      }

      var body = args[n + 1].body;
      cases.push({condition: args[n], body: body});
    }

    var elseBody;

    if (args.length % 2 === 1) {
      var body = args[args.length - 1].body;
      elseBody = body;
    }

    return cg.ifExpression(cases, elseBody);
  };

  var matchIfMacro = function (name) {
    if (/^if(ElseIf)*(Else)?$/.test(codegenUtils.concatName(name))) {
      return createIfExpression;
    }
  };

  macros.addWildCardMacro(['if'], matchIfMacro);

  macros.addMacro(['new'], function(term, name, args) {
    var constructor;

    if (args[0].isSubExpression) {
      constructor = args[0].statements[0];
    } else {
      constructor = args[0];
    }

    return cg.newOperator(constructor);
  });

  var areValidArguments = function () {
    var args = arguments[0];
    var argValidators = Array.prototype.slice.call(arguments, 1);

    if (args && args.length === argValidators.length) {
      return _.all(_.zip(args, argValidators), function (argval) {
        return argval[1](argval[0]);
      });
    } else {
      return false;
    }
  };

  var isClosureWithParameters = function (paramterCount) {
    return function (arg) {
      return arg.isClosure && arg.parameters.length === paramterCount;
    };
  };

  var isAny = function (arg) {
    return arg !== undefined;
  };

  var isDefinition = function (arg) {
    return arg.isDefinition;
  };

  var createForEach = function (term, name, args) {
    if (areValidArguments(args, isAny, isClosureWithParameters(1))) {
      var collection = args[0];
      var block = args[1];
      var body = block.body;

      var itemVariable = block.parameters[0];

      return cg.forEach(collection, itemVariable, block.body);
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to for each in are incorrect, try:\n\nfor each @(item) in (items)\n    do something with (item)');
    }
  };

  macros.addMacro(['for', 'each', 'in'], createForEach);

  macros.addMacro(['for', 'in'], function (term, name, args) {
    if (areValidArguments(args, isAny, isClosureWithParameters(1))) {
      var collection = args[0];
      var block = args[1];
      var iterator = block.parameters[0];
      var body = block.body;

      return cg.forIn(iterator, collection, block.body);
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to for in are incorrect, try:\n\nfor @(field) in (object)\n    do something with (field)');
    }
  });

  macros.addMacro(['for'], function(term, name, args) {
    if (areValidArguments(args, isDefinition, isAny, isAny, isClosureWithParameters(0))) {
      var init = args[0];
      var test = args[1];
      var incr = args[2];

      if (!init)
        return errors.addTermWithMessage(args[0], 'expected init, as in (n = 0. ...)');

      if (!test)
        return errors.addTermWithMessage(args[0], 'expected test, as in (... . n < 10. ...)');

      if (!incr)
        return errors.addTermWithMessage(args[0], 'expected incr, as in (... . ... . n = n + 1)');

      return cg.forStatement(init, test, incr, args[3].body);
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to for are incorrect, try:\n\nfor (n = 0, n < 10, ++n)\n    do something with (n)');
    }
  });

  macros.addMacro(['while'], function(term, name, args) {
    if (areValidArguments(args, isAny, isClosureWithParameters(0))) {
      var test = args[0];
      var statements = args[1].body;

      return cg.whileStatement(test, statements);
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to while are incorrect, try:\n\nwhile (condition)\n    do something ()');
    }
  });
  
  macros.addMacro(['with'], function(term, name, args) {
    if (areValidArguments(args, isAny, isClosureWithParameters(0))) {
      return cg.withStatement(args[0], args[1].body);
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to with are incorrect, try:\n\nwith (object)\n    do something with (field)');
    }
  });

  macros.addMacro(['and'], function (term, name, args) {
    return cg.operator('&&', args);
  });

  macros.addMacro(['or'], function (term, name, args) {
    return cg.operator('||', args);
  });

  macros.addMacro(['not'], function (term, name, args) {
    return cg.operator('!', args);
  });

  macros.addMacro(['return'], function(term, name, args) {
    return cg.returnStatement(args && args[0]);
  });

  macros.addMacro(['continuation'], function(term, name, args) {
    if (args) {
      return cg.functionCall(cg.callbackFunction, args, {couldBeMacro: false});
    } else {
      return cg.callbackFunction;
    }
  });

  macros.addMacro(['throw'], function(term, name, args) {
    if (areValidArguments(args, isAny)) {
      return cg.throwStatement(args[0]);
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to throw are incorrect, try: @throw error');
    }
  });

  macros.addMacro(['break'], function(term, name, args) {
    return cg.breakStatement();
  });

  macros.addMacro(['continue'], function(term, name, args) {
    return cg.continueStatement();
  });

  macros.addMacro(['try', 'catch'], function (term, name, args) {
    if (areValidArguments(args, isClosureWithParameters(0), isAny, isClosureWithParameters(0))) {
      var body = args[0].body;
      var catchParameter = args[1];
      var catchBody = args[2].body;

      return cg.tryExpression(body, {catchBody: catchBody, catchParameter: catchParameter});
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to try catch are incorrect, try:\n\ntry\n    something dangerous ()\ncatch (error)\n    handle (error)');
    }
  });

  macros.addMacro(['try', 'catch', 'finally'], function (term, name, args) {
    if (areValidArguments(args, isClosureWithParameters(0), isAny, isClosureWithParameters(0), isClosureWithParameters(0))) {
      var body = args[0].body;
      var catchParameter = args[1];
      var catchBody = args[2].body;
      var finallyBody = args[3].body;

      return cg.tryExpression(body, {catchBody: catchBody, catchParameter: catchParameter, finallyBody: finallyBody});
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to try catch finally are incorrect, try:\n\ntry\n    something dangerous ()\ncatch (error)\n    handle (error)\nfinally\n    always do this ()');
    }
  });

  macros.addMacro(['try', 'finally'], function (term, name, args) {
    if (areValidArguments(args, isClosureWithParameters(0), isClosureWithParameters(0))) {
      var body = args[0].body;
      var finallyBody = args[1].body;

      return cg.tryExpression(body, {finallyBody: finallyBody});
    } else {
      return cg.errors.addTermWithMessage(term, 'arguments to try finally are incorrect, try:\n\ntry\n    something dangerous ()\nfinally\n    always do this ()');
    }
  });

  macros.addMacro(['nil'], function (term) {
    return cg.nil();
  });
  
  return macros;
};

});

require.define("/lib/parser/listMacros.js",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var _;
    _ = require("underscore");
    module.exports = function(terms) {
        var self = this;
        var macros, isValidComprehension, comprehensionExpressionFor, comprehensionExpressionsFrom, iterator, map, definition, filter, expressions, isIterator, isDefinition;
        macros = terms.macroDirectory();
        isValidComprehension = function(term) {
            var firstItemIsNotHashEntry, secondItemIsWhereHashEntry, secondItemIsIterator, theRestOfTheItemsAreNotHashEntries;
            if (term.items.length < 2) {
                return false;
            }
            firstItemIsNotHashEntry = function() {
                return !term.items[0].isHashEntry;
            };
            secondItemIsWhereHashEntry = function() {
                return term.items[1].isHashEntry && term.items[1].field.length === 1 && term.items[1].field[0] === "where";
            };
            secondItemIsIterator = function() {
                return isIterator(term.items[1].value);
            };
            theRestOfTheItemsAreNotHashEntries = function() {
                return !_.any(term.items.slice(2), function(item) {
                    return item.isHashEntry;
                });
            };
            return firstItemIsNotHashEntry() && secondItemIsWhereHashEntry() && secondItemIsIterator() && theRestOfTheItemsAreNotHashEntries();
        };
        comprehensionExpressionFor = function(expr) {
            if (isIterator(expr)) {
                return iterator(expr);
            } else if (isDefinition(expr)) {
                return definition(expr);
            } else {
                return filter(expr);
            }
        };
        comprehensionExpressionsFrom = function(term, resultsVariable) {
            var exprs, comprehensionExprs;
            exprs = term.items.slice(2);
            exprs.unshift(term.items[1].value);
            comprehensionExprs = function() {
                var gen1_results, gen2_items, gen3_i, expr;
                gen1_results = [];
                gen2_items = exprs;
                for (gen3_i = 0; gen3_i < gen2_items.length; ++gen3_i) {
                    expr = gen2_items[gen3_i];
                    gen1_results.push(comprehensionExpressionFor(expr));
                }
                return gen1_results;
            }();
            comprehensionExprs.push(map(term.items[0], resultsVariable));
            return expressions(comprehensionExprs);
        };
        iterator = function(expression) {
            return {
                isIterator: true,
                iterator: expression.functionArguments[0],
                collection: expression.functionArguments[1],
                generate: function(rest) {
                    var self = this;
                    return [ terms.forEach(self.collection, self.iterator, terms.asyncStatements(rest.generate())) ];
                }
            };
        };
        map = function(expression, resultsVariable) {
            return {
                isMap: true,
                generate: function() {
                    var self = this;
                    return [ terms.methodCall(resultsVariable, [ "push" ], [ expression ]) ];
                }
            };
        };
        definition = function(expression) {
            return {
                isDefinition: true,
                generate: function(rest) {
                    var self = this;
                    var statements, gen4_o;
                    statements = [ expression ];
                    gen4_o = statements;
                    gen4_o.push.apply(gen4_o, rest.generate());
                    return statements;
                }
            };
        };
        filter = function(expression) {
            return {
                isFilter: true,
                generate: function(rest) {
                    var self = this;
                    return [ terms.ifExpression([ {
                        condition: expression,
                        body: terms.asyncStatements(rest.generate())
                    } ]) ];
                }
            };
        };
        expressions = function(exprs) {
            return {
                expressions: exprs,
                generate: function() {
                    var self = this;
                    if (exprs.length > 0) {
                        return exprs[0].generate(expressions(exprs.slice(1)));
                    } else {
                        return [];
                    }
                }
            };
        };
        isIterator = function(expression) {
            var $function;
            if (expression.isFunctionCall) {
                $function = expression.function;
                if ($function.isVariable) {
                    if ($function.variable.length === 1 && $function.variable[0] === "<-") {
                        return true;
                    }
                }
            }
        };
        isDefinition = function(expression) {
            return expression.isDefinition;
        };
        macros.addMacro([ "where" ], function(term, name, args) {
            var badComprehension, resultsVariable, exprs, statements, gen5_o;
            badComprehension = function() {
                return terms.errors.addTermWithMessage(term, "not a list comprehension, try:\n\n    [y + 1, where: x <- [1..10], x % 2, y = x + 10]");
            };
            if (isValidComprehension(term)) {
                resultsVariable = terms.generatedVariable([ "results" ]);
                exprs = comprehensionExpressionsFrom(term, resultsVariable);
                statements = [ terms.definition(resultsVariable, terms.list([])) ];
                gen5_o = statements;
                gen5_o.push.apply(gen5_o, exprs.generate());
                statements.push(resultsVariable);
                return terms.scope(statements);
            } else {
                return badComprehension();
            }
        });
        return macros;
    };
}).call(this);
});

require.define("/test/parserAssertions.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var createParser, createTerms, parser, parse, assumeIsModuleWithStatements, assumeHasJustOneStatement;
    createParser = require("../lib/parser/parser").createParser;
    createTerms = function() {
        return require("../lib/parser/codeGenerator").codeGenerator();
    };
    parser = createParser({
        terms: createTerms()
    });
    parse = parser.parse;
    assumeIsModuleWithStatements = function(term, action) {
        if (term.isModule) {
            return action(term.statements);
        } else {
            throw new Error("expected module, but found " + term.inspectTerm());
        }
    };
    assumeHasJustOneStatement = function(statements, action) {
        if (statements.statements.length === 1) {
            return statements.statements[0];
        } else {
            throw new Error("expected statements to have just one statement, found " + statements.statements.length);
        }
    };
    global.expression = function(source) {
        var self = this;
        return assumeHasJustOneStatement(statements(source), function(statement) {
            return statement;
        });
    };
    global.macroExpression = function(source) {
        var self = this;
        return assumeHasJustOneStatement(statements(source, {
            expandMacros: true
        }), function(statement) {
            return statement;
        });
    };
    global.macroStatements = function(source, gen1_options) {
        var self = this;
        var print;
        print = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "print") && gen1_options.print !== void 0 ? gen1_options.print : false;
        var stmts;
        stmts = statements(source, {
            expandMacros: true
        });
        if (print) {
            stmts.show();
        }
        return stmts;
    };
    global.statements = function(source, gen2_options) {
        var self = this;
        var expandMacros;
        expandMacros = gen2_options !== void 0 && Object.prototype.hasOwnProperty.call(gen2_options, "expandMacros") && gen2_options.expandMacros !== void 0 ? gen2_options.expandMacros : false;
        return parse(source);
    };
}).call(this);
});

require.define("/test/codeGeneratorAssertions.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var MemoryStream, terms, assert, shouldGenerateGeneratedBy;
    MemoryStream = require("../lib/memorystream").MemoryStream;
    terms = require("../lib/parser/codeGenerator").codeGenerator();
    assert = require("assert");
    shouldGenerateGeneratedBy = function(term, source, generate, gen1_options) {
        var print;
        print = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "print") && gen1_options.print !== void 0 ? gen1_options.print : false;
        var stream, code;
        stream = new MemoryStream;
        generate(term, stream, new terms.SymbolScope);
        code = stream.toString();
        if (print) {
            console.log(code);
        }
        return assert.equal(code, source);
    };
    global.shouldGenerateExpression = function(term, source, options) {
        var self = this;
        return shouldGenerateGeneratedBy(term, source, function(term, stream, scope) {
            return term.generateJavaScript(stream, scope);
        }, options);
    };
    global.shouldGenerateStatement = function(term, source, options) {
        var self = this;
        return shouldGenerateGeneratedBy(term, source, function(term, stream, scope) {
            return term.generateJavaScriptStatement(stream, scope);
        }, options);
    };
    global.shouldGenerateStatements = function(term, source, options) {
        var self = this;
        return shouldGenerateGeneratedBy(term, source, function(term, stream, scope) {
            return term.generateJavaScriptStatements(stream, scope, {
                inClosure: true
            });
        }, options);
    };
    global.shouldGenerateGlobalStatements = function(term, source, options) {
        var self = this;
        return shouldGenerateGeneratedBy(term, source, function(term, stream, scope) {
            return term.generateJavaScriptStatements(stream, scope, {
                global: true
            });
        }, options);
    };
    global.shouldGenerateModule = function(term, source, options) {
        var self = this;
        return shouldGenerateGeneratedBy(term, source, function(term, stream) {
            return term.generateJavaScriptModule(stream);
        }, options);
    };
}).call(this);
});

require.define("/test/asyncForSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var async, should;
    async = require("../lib/asyncControl");
    should = require("should");
    require("./assertions");
    describe("for", function() {
        it("executes each loop sequentially", function(done) {
            var n, loops;
            n = 0;
            loops = [];
            return async.for(function(cb) {
                return cb(void 0, n < 3);
            }, function(cb) {
                ++n;
                return cb();
            }, function(cb) {
                loops.push(n);
                return cb();
            }, function() {
                try {
                    shouldContainFields(loops, [ 0, 1, 2 ]);
                    return done();
                } catch (error) {
                    return done(error);
                }
            });
        });
        context("when test returns error", function() {
            return it("returns error", function(done) {
                var n, loops;
                n = 0;
                loops = [];
                return async.for(function(cb) {
                    return cb("test error");
                }, function(cb) {
                    ++n;
                    return cb();
                }, function(cb) {
                    loops.push(n);
                    return cb();
                }, function(error) {
                    try {
                        shouldContainFields(loops, []);
                        should.equal(error, "test error");
                        return done();
                    } catch (error) {
                        return done(error);
                    }
                });
            });
        });
        context("when test throws error", function() {
            return it("returns error", function(done) {
                var n, loops;
                n = 0;
                loops = [];
                return async.for(function(cb) {
                    throw "test error";
                }, function(cb) {
                    ++n;
                    return cb();
                }, function(cb) {
                    loops.push(n);
                    return cb();
                }, function(error) {
                    try {
                        shouldContainFields(loops, []);
                        should.equal(error, "test error");
                        return done();
                    } catch (error) {
                        return done(error);
                    }
                });
            });
        });
        context("when incr returns error", function() {
            return it("returns error", function(done) {
                var n, loops;
                n = 0;
                loops = [];
                return async.for(function(cb) {
                    return cb(void 0, n < 3);
                }, function(cb) {
                    return cb("incr error");
                }, function(cb) {
                    loops.push(n);
                    return cb();
                }, function(error) {
                    try {
                        shouldContainFields(loops, [ 0 ]);
                        should.equal(error, "incr error");
                        return done();
                    } catch (error) {
                        return done(error);
                    }
                });
            });
        });
        context("when incr throws error", function() {
            return it("returns error", function(done) {
                var n, loops;
                n = 0;
                loops = [];
                return async.for(function(cb) {
                    return cb(void 0, n < 3);
                }, function(cb) {
                    throw "incr error";
                }, function(cb) {
                    loops.push(n);
                    return cb();
                }, function(error) {
                    try {
                        shouldContainFields(loops, [ 0 ]);
                        should.equal(error, "incr error");
                        return done();
                    } catch (error) {
                        return done(error);
                    }
                });
            });
        });
        context("when loop returns error", function() {
            return it("returns error", function(done) {
                var n, loops;
                n = 0;
                loops = [];
                return async.for(function(cb) {
                    return cb(void 0, n < 3);
                }, function(cb) {
                    ++n;
                    return cb();
                }, function(cb) {
                    loops.push(n);
                    return cb("loop error");
                }, function(error) {
                    try {
                        shouldContainFields(loops, [ 0 ]);
                        should.equal(error, "loop error");
                        return done();
                    } catch (error) {
                        return done(error);
                    }
                });
            });
        });
        return context("when loop throws error", function() {
            return it("returns error", function(done) {
                var n, loops;
                n = 0;
                loops = [];
                return async.for(function(cb) {
                    return cb(void 0, n < 3);
                }, function(cb) {
                    ++n;
                    return cb();
                }, function(cb) {
                    loops.push(n);
                    throw "loop error";
                }, function(error) {
                    try {
                        shouldContainFields(loops, [ 0 ]);
                        should.equal(error, "loop error");
                        return done();
                    } catch (error) {
                        return done(error);
                    }
                });
            });
        });
    });
}).call(this);
});
require("/test/asyncForSpec.pogo");

require.define("/test/asyncFunctionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var should, script, asyncShouldOutput;
    should = require("should");
    script = require("./scriptAssertions");
    asyncShouldOutput = script.asyncShouldOutput;
    describe("asynchronous functions", function() {
        describe("function with one argument", function() {
            return it("takes that argument when passed, and as nil when not", function(continuation) {
                var gen1_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                continuation = arguments[arguments.length - 1];
                if (!(continuation instanceof Function)) {
                    throw new Error("asynchronous function called synchronously");
                }
                asyncShouldOutput('f!(url) = url\n\nprint (f!("url"))\nprint (f!())\n\ndone ()', "'url'\nundefined", continuation);
            });
        });
        describe("function with an optional argument", function() {
            return it("takes the optional argument when specified, or the default when not", function(continuation) {
                var gen2_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                continuation = arguments[arguments.length - 1];
                if (!(continuation instanceof Function)) {
                    throw new Error("asynchronous function called synchronously");
                }
                asyncShouldOutput('f!(name: "jack default") = name\n\nprint (f!(name: "jill specified"))\nprint (f!())\n\ndone ()', "'jill specified'\n'jack default'", continuation);
            });
        });
        describe("function with a normal and an optional argument", function() {
            return it("takes both arguments when specified, or nil for the normal, and the default for the optional", function(continuation) {
                var gen3_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                continuation = arguments[arguments.length - 1];
                if (!(continuation instanceof Function)) {
                    throw new Error("asynchronous function called synchronously");
                }
                asyncShouldOutput('f!(a, name: "jack default") = [a, name]\n\nprint (f!("a", name: "jill specified"))\nprint (f!("a"))\nprint (f!())\n\ndone ()', "[ 'a', 'jill specified' ]\n[ 'a', 'jack default' ]\n[ undefined, 'jack default' ]", continuation);
            });
        });
        describe("function with two arguments", function() {
            return it("takes arguments when passed starting with the first one, or nil when not passed", function(continuation) {
                var gen4_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                continuation = arguments[arguments.length - 1];
                if (!(continuation instanceof Function)) {
                    throw new Error("asynchronous function called synchronously");
                }
                asyncShouldOutput('f!(a, b) = [a, b]\n\nprint (f!("a", "b"))\nprint (f!("a"))\nprint (f!())\n\ndone ()', "[ 'a', 'b' ]\n[ 'a', undefined ]\n[ undefined, undefined ]", continuation);
            });
        });
        describe("function with a splat argument", function() {
            return it("takes splat argument as a list", function(continuation) {
                var gen5_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                continuation = arguments[arguments.length - 1];
                if (!(continuation instanceof Function)) {
                    throw new Error("asynchronous function called synchronously");
                }
                asyncShouldOutput('f!(a, ...) = a\n\nprint (f!("a", "b"))\nprint (f!("a"))\nprint (f!())\n\ndone ()', "[ 'a', 'b' ]\n[ 'a' ]\n[]", continuation);
            });
        });
        describe("function with a normal argument and a splat argument", function() {
            return it("takes the first argument if present, then the remaining arguments in a list", function(continuation) {
                var gen6_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                continuation = arguments[arguments.length - 1];
                if (!(continuation instanceof Function)) {
                    throw new Error("asynchronous function called synchronously");
                }
                asyncShouldOutput('f!(a, b, ...) = [a, b]\n\nprint (f!("a", "b", "c"))\nprint (f!("a", "b"))\nprint (f!("a"))\nprint (f!())\n\ndone ()', "[ 'a', [ 'b', 'c' ] ]\n[ 'a', [ 'b' ] ]\n[ 'a', [] ]\n[ undefined, [] ]", continuation);
            });
        });
        return describe("function with a normal argument and a splat argument, followed by another argument", function() {
            return it("takes the first argument if present, then the remaining arguments in a list", function(continuation) {
                var gen7_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                continuation = arguments[arguments.length - 1];
                if (!(continuation instanceof Function)) {
                    throw new Error("asynchronous function called synchronously");
                }
                asyncShouldOutput('f!(a, b, ... , c) = [a, b, c]\n\nprint (f!("a", "b", "c", "d"))\nprint (f!("a", "b", "c"))\nprint (f!("a", "b"))\nprint (f!("a"))\nprint (f!())\n\ndone ()', "[ 'a', [ 'b', 'c' ], 'd' ]\n[ 'a', [ 'b' ], 'c' ]\n[ 'a', [], 'b' ]\n[ 'a', [], undefined ]\n[ undefined, [], undefined ]", continuation);
            });
        });
    });
}).call(this);
});
require("/test/asyncFunctionSpec.pogo");

require.define("/test/asyncIfSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var async, should;
    async = require("../lib/asyncControl");
    should = require("should");
    describe("if", function() {
        it("calls the callback with the result of the then", function(done) {
            return async.if(true, function(callback) {
                return callback(void 0, "result");
            }, function(error, result) {
                if (error) {
                    return done(error);
                } else {
                    result.should.equal("result");
                    return done();
                }
            });
        });
        it("calls the callback with the error of the then", function(done) {
            return async.if(true, function(callback) {
                return callback("error");
            }, function(error, result) {
                try {
                    error.should.equal("error");
                    should.not.exist(result);
                    return done();
                } catch (ex) {
                    return done(ex);
                }
            });
        });
        return it("calls the callback with the error when the then throws", function(done) {
            return async.if(true, function(callback) {
                throw "error";
            }, function(error, result) {
                try {
                    error.should.equal("error");
                    should.not.exist(result);
                    return done();
                } catch (ex) {
                    return done(ex);
                }
            });
        });
    });
    describe("if else", function() {
        it("calls the callback with the result of the then", function(done) {
            return async.ifElse(true, function(callback) {
                return callback(void 0, "then result");
            }, function(callback) {
                return callback(void 0, "else result");
            }, function(error, result) {
                if (error) {
                    return done(error);
                } else {
                    result.should.equal("then result");
                    return done();
                }
            });
        });
        it("calls the callback with the error of the then", function(done) {
            return async.ifElse(true, function(callback) {
                return callback("then error");
            }, function(callback) {
                return callback(void 0, "else result");
            }, function(error, result) {
                try {
                    error.should.equal("then error");
                    should.not.exist(result);
                    return done();
                } catch (ex) {
                    return done(ex);
                }
            });
        });
        it("calls the callback with the error when the then throws", function(done) {
            return async.ifElse(true, function(callback) {
                throw "then error";
            }, function(callback) {
                return callback(void 0, "else result");
            }, function(error, result) {
                try {
                    error.should.equal("then error");
                    should.not.exist(result);
                    return done();
                } catch (ex) {
                    return done(ex);
                }
            });
        });
        it("calls the callback with the result of the else", function(done) {
            return async.ifElse(false, function(callback) {
                return callback(void 0, "then result");
            }, function(callback) {
                return callback(void 0, "else result");
            }, function(error, result) {
                if (error) {
                    return done(error);
                } else {
                    result.should.equal("else result");
                    return done();
                }
            });
        });
        it("calls the callback with the error of the else", function(done) {
            return async.ifElse(false, function(callback) {
                return callback(void 0, "then result");
            }, function(callback) {
                return callback("else error");
            }, function(error, result) {
                error.should.equal("else error");
                should.not.exist(result);
                return done();
            });
        });
        return it("calls the callback with the error when the else throws", function(done) {
            return async.ifElse(false, function(callback) {
                return callback(void 0, "then result");
            }, function(callback) {
                throw "else error";
            }, function(error, result) {
                error.should.equal("else error");
                should.not.exist(result);
                return done();
            });
        });
    });
    describe("if else if else", function() {
        it("executes the first body when only the first condition is true", function(done) {
            return async.ifElseIfElse([ {
                condition: true,
                body: function(callback) {
                    return callback(void 0, "first result");
                }
            }, {
                condition: false,
                body: function(callback) {
                    return callback(void 0, "second result");
                }
            } ], function(error, result) {
                result.should.equal("first result");
                should.not.exist(error);
                return done();
            });
        });
        it("executes the second body when only the second condition is true", function(done) {
            return async.ifElseIfElse([ {
                condition: false,
                body: function(callback) {
                    return callback(void 0, "first result");
                }
            }, {
                condition: true,
                body: function(callback) {
                    return callback(void 0, "second result");
                }
            } ], function(error, result) {
                result.should.equal("second result");
                should.not.exist(error);
                return done();
            });
        });
        it("returns an error if the body throws", function(done) {
            return async.ifElseIfElse([ {
                condition: true,
                body: function(callback) {
                    throw "error";
                }
            } ], function(error, result) {
                error.should.equal("error");
                should.not.exist(result);
                return done();
            });
        });
        return it("returns nil if no conditions are true", function(done) {
            return async.ifElseIfElse([ {
                condition: false,
                body: function(callback) {
                    throw "error";
                }
            } ], function(error, result) {
                should.not.exist(result);
                should.not.exist(error);
                return done();
            });
        });
    });
}).call(this);
});
require("/test/asyncIfSpec.pogo");

require.define("/test/asyncMethodsSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var should, script, asyncShouldOutput;
    should = require("should");
    script = require("./scriptAssertions");
    asyncShouldOutput = script.asyncShouldOutput;
    describe("asynchronous methods", function() {
        return describe("methods that don't have async bodies, but are defined with the async operator", function() {
            context("when the method is defined on an existing object", function() {
                return it("makes the method asynchronous anyway", function(continuation) {
                    var gen1_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                    continuation = arguments[arguments.length - 1];
                    if (!(continuation instanceof Function)) {
                        throw new Error("asynchronous function called synchronously");
                    }
                    asyncShouldOutput('o = {}\no.f!() = "result"\n\nprint (o.f!())\n\ndone ()', "'result'", continuation);
                });
            });
            context("when the method is defined on an exiting object, but with an indexer", function() {
                return it("makes the method asynchronous anyway", function(continuation) {
                    var gen2_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                    continuation = arguments[arguments.length - 1];
                    if (!(continuation instanceof Function)) {
                        throw new Error("asynchronous function called synchronously");
                    }
                    asyncShouldOutput('o = {}\no."f"!() = "result"\n\nprint (o.f!())\n\ndone ()', "'result'", continuation);
                });
            });
            return context("when the method is defined as part of the object expression", function() {
                return it("makes the method asynchronous anyway", function(continuation) {
                    var gen3_arguments = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                    continuation = arguments[arguments.length - 1];
                    if (!(continuation instanceof Function)) {
                        throw new Error("asynchronous function called synchronously");
                    }
                    asyncShouldOutput('o = {\n    f!() = "result"\n}\n\nprint (o.f!())\n\ndone ()', "'result'", continuation);
                });
            });
        });
    });
}).call(this);
});
require("/test/asyncMethodsSpec.pogo");

require.define("/test/asyncSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script, asyncShouldOutput, shouldOutput;
    script = require("./scriptAssertions");
    asyncShouldOutput = script.asyncShouldOutput;
    shouldOutput = script.shouldOutput;
    describe("async", function() {
        it("can make one async call in statements", function(done) {
            return asyncShouldOutput('f (callback) =\n    process.next tick\n        callback (nil, "result")\n       \nx = f ()!\nprint (x)\ndone ()', "'result'", done);
        });
        it("can make two async calls in a row", function(done) {
            return asyncShouldOutput('aprint! (msg) =\n    async!\n    print (msg)\n\naprint! "one"\naprint! "two"\nprint "finished"\ndone ()', "'one'\n'two'\n'finished'", done);
        });
        it("can make one async call as argument to another function", function(done) {
            return asyncShouldOutput('f (callback) =\n    process.next tick\n        callback (nil, "result")\n       \nprint (f ()!)\ndone ()', "'result'", done);
        });
        it("it only exits once", function(done) {
            return asyncShouldOutput("do stuff! =\n    async!\n    process.next tick!\n    async!\n\ndo stuff!\n\nprint 'finished'\ndone ()", "'finished'", done);
        });
        it("single async call can be made in scopified assignment", function(done) {
            return asyncShouldOutput("f!() = 8\n\nx =\n    f!()\n\nprint (x)\n\ndone ()", "8", done);
        });
        it("async call expression can be made in scopified assignment", function(done) {
            return asyncShouldOutput("f!() = 8\n\nx =\n    f!() * 2\n\nprint (x)\n\ndone ()", "16", done);
        });
        it("statements including async call can be made in scopified assignment", function(done) {
            return asyncShouldOutput("f!() = 8\n\nx =\n    n = f!()\n    n * 2\n\nprint (x)\n\ndone ()", "16", done);
        });
        it("it can chain async methods", function(done) {
            return asyncShouldOutput("one!() =\n    async!()\n    {\n        two!() =\n            async!()\n            'finished'\n    }\n\nprint (one!().two!())\ndone ()", "'finished'", done);
        });
        it("throws if async function is not called asynchronously", function() {
            return function() {
                return shouldOutput("f!() = 12\n\nprint (f ())", "'finished'");
            }.should.throw("asynchronous function called synchronously");
        });
        it("an async function returns its result in a callback", function(done) {
            return asyncShouldOutput("as (f) =\n    process.next tick\n        f (nil, 4)\n\nfn () =\n    as ()!\n\nprint (fn ()!)\ndone ()", "4", done);
        });
        it("an async function can be passed an async block, which in turn returns its result in a callback", function(done) {
            return asyncShouldOutput('tick (callback) =\n    process.next tick\n        callback ()\n\nasync fun (block, callback) =\n    block (callback)\n\nresult = async fun!\n    tick!\n    "result"\n\nprint (result)\ndone ()', "'result'", done);
        });
        it("an async method call works in the same way as an async function call", function(done) {
            return asyncShouldOutput('async!\nprint "finished"\ndone ()', "'finished'", done);
        });
        it("makes a block asynchronous if it contains async statements", function(done) {
            return asyncShouldOutput('print result (block) =\n    block @(error, result)\n        print (result)\n        done ()\n\nprint result\n    async!\n    "finished"', "'finished'", done);
        });
        context("when an async function is called with a block", function() {
            return it("asyncifies the block", function(done) {
                return asyncShouldOutput('func! (block) = block!\n\nf = func!\n    "asdf"\n\nprint (f)\ndone ()', "'asdf'", done);
            });
        });
        it("thrown exceptions are passed to the error argument of the callback", function(done) {
            return asyncShouldOutput('f () =\n    async!\n    throw (new (Error "thing"))\n\nf(done)', "", function(error) {
                error.message.should.equal("thing");
                return done();
            });
        });
        describe("if statements", function() {
            it("if statements with async bodies wait until the body has finished", function(done) {
                return asyncShouldOutput('if (true)\n    async!\n    print "one"\n\nprint "two"\ndone ()', "'one'\n'two'", done);
            });
            it("if statements with async bodies and an else body wait until the body has finished", function(done) {
                return asyncShouldOutput('if (false)\n    async!\n    print "one"\nelse\n    print "two"\n\nprint "three"\ndone ()', "'two'\n'three'", done);
            });
            it("if else if else statements with async bodies wait until the body has finished", function(done) {
                return asyncShouldOutput('if (false)\n    async!\n    print "one"\nelse if (false)\n    async!\n    print "two"\nelse\n    async!\n    print "three"\n\nprint "four"\ndone ()', "'three'\n'four'", done);
            });
            return context("without else clause inside async function", function() {
                return it("returns via callback when condition is false", function(done) {
                    return asyncShouldOutput('f! =\n    if (false)\n        "result"\n\nf!\ndone ()', "", done);
                });
            });
        });
        describe("try statements", function() {
            return it("waits for the body to finish", function(done) {
                return asyncShouldOutput('try\n    async!\n    print "one"\ncatch (error)\n    async!\n    print (error)\nfinally\n    async!\n    print "finally"\n\nprint "finished"\ndone ()', "'one'\n'finally'\n'finished'", done);
            });
        });
        describe("while expression", function() {
            it("executes each loop one after the other", function(done) {
                return asyncShouldOutput("condition = true\nget condition! = condition\n\nwhile (get condition!)\n    print 'loop'\n    async!\n    condition := false\n\ndone ()", "'loop'", done);
            });
            return it("completes the function as the last statement", function(done) {
                return asyncShouldOutput("f! () =\n    while (false)\n        never here ()\n\nf! ()\ndone ()", "", done);
            });
        });
        describe("for expression", function() {
            it("executes each loop one after the other", function(done) {
                return asyncShouldOutput("for (n = 0, n < 3, ++n)\n    print ('before: ' + n)\n    async!\n    print ('after: ' + n)\n\ndone ()", "'before: 0'\n'after: 0'\n'before: 1'\n'after: 1'\n'before: 2'\n'after: 2'", done);
            });
            it("completes the function as the last statement", function(done) {
                return asyncShouldOutput("f! () =\n    for (n = 0, n < 3, ++n)\n        print 'loop'\n\nf! ()\ndone ()", "'loop'\n'loop'\n'loop'", done);
            });
            return it("doesn't return as last statement if body contains continuation", function(done) {
                return asyncShouldOutput("repeat! (times) times =\n    for (n = 0, n < times, ++n)\n        continuation (nil, n)\n\nn = repeat! 1 times\n\nprint (n)\ndone ()", "0", done);
            });
        });
        describe("for each expression", function() {
            it("executes each loop one after the other", function(done) {
                return asyncShouldOutput("for each @(n) in [0, 1, 2]\n    print ('before: ' + n)\n    async!\n    print ('after: ' + n)\n\ndone ()", "'before: 0'\n'after: 0'\n'before: 1'\n'after: 1'\n'before: 2'\n'after: 2'", done);
            });
            it("completes the function as the last statement", function(done) {
                return asyncShouldOutput("f! () =\n    for each @(n) in [0, 1, 2]\n        print ('before: ' + n)\n        async!\n        print ('after: ' + n)\n\nf! ()\ndone ()", "'before: 0'\n'after: 0'\n'before: 1'\n'after: 1'\n'before: 2'\n'after: 2'", done);
            });
            return it("doesn't return as last statement if body contains continuation", function(done) {
                return asyncShouldOutput("repeat! (times) times =\n    for each @(n) in [0]\n        continuation (nil, n)\n\nn = repeat! 1 times\n\nprint (n)\ndone ()", "0", done);
            });
        });
        describe("for in expression", function() {
            it("completes the function as the last statement", function(done) {
                return asyncShouldOutput("f! () =\n    for @(n) in {a = 1, b = 2}\n        print (n)\n\nf! ()\ndone ()", "'a'\n'b'", done);
            });
            return it("doesn't return as last statement if body contains continuation", function(done) {
                return asyncShouldOutput("repeat! (times) times =\n    for @(n) in {a = 1}\n        continuation (nil, n)\n\nn = repeat! 1 times\n\nprint (n)\ndone ()", "'a'", done);
            });
        });
        describe("splat arguments", function() {
            return it("can handle splat arguments in an async function", function(done) {
                return asyncShouldOutput("f! (a, ...) =\n    a\n\nprint (f! (1, 2, 3))\ndone ()", "[ 1, 2, 3 ]", done);
            });
        });
        describe("return", function() {
            return context("when in an async function", function() {
                return it("is rewritten to call the callback", function(done) {
                    return asyncShouldOutput('f! =\n    return "result"\n\nprint (f!)\ndone ()', "'result'", done);
                });
            });
        });
        return describe("continuation", function() {
            it("can be called in an async function as the callback", function(done) {
                return asyncShouldOutput('f! =\n    continuation (nil, "result")\n\nprint (f!)\ndone ()', "'result'", done);
            });
            it("can be passed to another function as the callback", function(done) {
                return asyncShouldOutput('g! = "result"\n\nf! = g (continuation)\n\nprint (f!)\ndone ()', "'result'", done);
            });
            it("can be called within another closure", function(done) {
                return asyncShouldOutput('g (block) = block ("result")\n\nf! = g @(result)\n    continuation (nil, result)\n\nprint (f!)\ndone ()', "'result'", done);
            });
            it("but can't be called within another async closure", function(done) {
                return asyncShouldOutput('g! (block) = "g #(block!)"\n\nf! = g!\n    continuation (nil, "result")\n\nprint (f!)\ndone ()', "'g result'", done);
            });
            context("when not the last statement", function() {
                return it("the callback isn't called on the last statement", function(done) {
                    return asyncShouldOutput('f! =\n    continuation (nil, "result")\n    "non result"\n\nprint (f!)\ndone ()', "'result'", done);
                });
            });
            context("when continuation is after async call", function() {
                it("doesn't call the callback on the last statement", function(done) {
                    return asyncShouldOutput('g! = "result"\n                \nf! =\n    g!\n    continuation (nil, "result")\n    "non result"\n\nprint (f!)\ndone ()', "'result'", done);
                });
                return context("and the async call raises an error", function() {
                    return it("raises an error on the callback", function(done) {
                        return asyncShouldOutput('g (callback) = callback (@new Error "argh!")\n                    \nf! =\n    g!\n    continuation (nil, "result")\n    "non result"\n\ntry\n    f!\ncatch (e)\n    print (e.message)\n\ndone ()', "'argh!'", done);
                    });
                });
            });
            context("when continuation is in the body and an exception is thrown", function() {
                return it("raises the exception", function(done) {
                    return asyncShouldOutput('f! =\n    @throw @new Error "argh!"\n    continuation (nil, "result")\n    "non result"\n\ntry\n    f!\ncatch (e)\n    print (e.message)\n\ndone ()', "'argh!'", done);
                });
            });
            return context("when continuation is in the body, and async call is last", function() {
                it("doesn't return on the last statement", function(done) {
                    return asyncShouldOutput('g! = "non result"\n                \nf! =\n    continuation (nil, "result")\n    g!\n\nprint (f!)\ndone ()', "'result'", done);
                });
                return it("raises error if async call raises error", function(done) {
                    return asyncShouldOutput('e (callback) = callback (@new Error "argh!")\n                \nf! =\n    continuation (nil, "result")\n    e!\n\nf @(error, result)\n    if (result)\n        print (result)\n\n    if (error)\n        print (error.message)\n        done ()', "'result'\n'argh!'", done);
                });
            });
        });
    });
}).call(this);
});
require("/test/asyncSpec.pogo");

require.define("/test/asyncStatementsSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, shouldContainFields;
    terms = require("../lib/parser/codeGenerator").codeGenerator();
    shouldContainFields = require("./containsFields").containsFields;
    describe("async statements", function() {
        describe("serialising sub statements", function() {
            it("serialises sub statements", function() {
                var statements;
                statements = terms.asyncStatements([ terms.subStatements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]) ]);
                return shouldContainFields(statements, terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]));
            });
            it("serialises sub statements inside sub statements", function() {
                var statements;
                statements = terms.asyncStatements([ terms.subStatements([ terms.subStatements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]), terms.variable([ "c" ]) ]) ]);
                return shouldContainFields(statements, terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]));
            });
            it("serialises sub statements inside sub statements, even if they are the last statement", function() {
                var statements;
                statements = terms.asyncStatements([ terms.subStatements([ terms.variable([ "a" ]), terms.subStatements([ terms.variable([ "b" ]), terms.variable([ "c" ]) ]) ]) ]);
                return shouldContainFields(statements, terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]));
            });
            return it("doesn't serialise sub statements in inner blocks", function() {
                var statements;
                statements = terms.asyncStatements([ terms.statements([ terms.subStatements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]) ]) ]);
                return shouldContainFields(statements, terms.statements([ terms.statements([ terms.subStatements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]) ]) ]));
            });
        });
        return describe("rewriting async calls into calls with callbacks", function() {
            describe("when there are no async calls", function() {
                return it("doesn't do anything", function() {
                    var statements;
                    statements = terms.asyncStatements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]);
                    return shouldContainFields(statements, terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]));
                });
            });
            describe("when there is one async call, with no statements after it", function() {
                return it("passes the outer callback function as the last argument", function() {
                    var statements;
                    statements = terms.asyncStatements([ terms.functionCall(terms.variable([ "async", "func" ]), [ terms.variable([ "arg" ]) ], {
                        async: true
                    }) ]);
                    return shouldContainFields(statements, terms.statements([ terms.functionCall(terms.variable([ "async", "func" ]), [ terms.variable([ "arg" ]) ], {
                        originallyAsync: true,
                        asyncCallbackArgument: terms.callbackFunction
                    }) ], {
                        async: true
                    }));
                });
            });
            return describe("when there are statements after the async call", function() {
                return it("puts them into a callback and passes the callback as the last argument", function() {
                    var statements;
                    statements = terms.asyncStatements([ terms.functionCall(terms.variable([ "async", "func" ]), [ terms.variable([ "arg" ]) ], {
                        async: true
                    }), terms.functionCall(terms.variable([ "another", "func" ]), []) ]);
                    return shouldContainFields(statements, terms.statements([ terms.functionCall(terms.variable([ "async", "func" ]), [ terms.variable([ "arg" ]) ], {
                        originallyAsync: true,
                        asyncCallbackArgument: terms.asyncCallback(terms.statements([ terms.asyncResult(), terms.functionCall(terms.variable([ "another", "func" ]), []) ]), {
                            resultVariable: terms.asyncResult()
                        })
                    }) ], {
                        async: true
                    }));
                });
            });
        });
    });
}).call(this);
});
require("/test/asyncStatementsSpec.pogo");

require.define("/test/asyncTrySpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var async, should;
    async = require("../lib/asyncControl");
    should = require("should");
    describe("try statement", function() {
        var throws, returnsError, returns, doesNothing, whenTheThenAndWhenFinished;
        throws = function(error) {
            var withCallback;
            return withCallback = function(callback) {
                throw error;
            };
        };
        returnsError = function(error) {
            var withCallback;
            return withCallback = function(callback) {
                return callback(error);
            };
        };
        returns = function(result) {
            var withCallback;
            return withCallback = function(callback) {
                return callback(void 0, result);
            };
        };
        doesNothing = function(callback) {
            return callback();
        };
        whenTheThenAndWhenFinished = function(assertions, done, gen1_options) {
            var body, catchBody, finallyBody;
            body = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "body") && gen1_options.body !== void 0 ? gen1_options.body : void 0;
            catchBody = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "catchBody") && gen1_options.catchBody !== void 0 ? gen1_options.catchBody : void 0;
            finallyBody = gen1_options !== void 0 && Object.prototype.hasOwnProperty.call(gen1_options, "finallyBody") && gen1_options.finallyBody !== void 0 ? gen1_options.finallyBody : void 0;
            var catchBodyExecuted, caughtError, finallyBodyExecuted, catchClause, finallyClause;
            catchBodyExecuted = false;
            caughtError = void 0;
            finallyBodyExecuted = false;
            catchClause = function() {
                if (catchBody) {
                    return function(error, callback) {
                        should.equal(catchBodyExecuted, false);
                        catchBodyExecuted = true;
                        caughtError = error;
                        return catchBody(callback);
                    };
                }
            }();
            finallyClause = function() {
                if (finallyBody) {
                    return function(callback) {
                        should.equal(finallyBodyExecuted, false);
                        finallyBodyExecuted = true;
                        return finallyBody(callback);
                    };
                }
            }();
            return async.try(function(callback) {
                return body(callback);
            }, catchClause, finallyClause, function(error, result) {
                try {
                    should.equal(catchBodyExecuted, assertions.catchBodyExecuted || false);
                    should.equal(finallyBodyExecuted, assertions.finallyBodyExecuted || false);
                    should.equal(caughtError, assertions.caughtError);
                    should.equal(result, assertions.result);
                    should.equal(error, assertions.error);
                    return done();
                } catch (error) {
                    return done(error);
                }
            });
        };
        context("with only a catch clause", function() {
            context("body returns", function() {
                return it("doesn't execute the catch body", function(done) {
                    return whenTheThenAndWhenFinished({
                        result: "result"
                    }, done, {
                        body: returns("result"),
                        catchBody: doesNothing
                    });
                });
            });
            context("body throws", function() {
                context("catch returns", function() {
                    return it("returns the catch result", function(done) {
                        return whenTheThenAndWhenFinished({
                            catchBodyExecuted: true,
                            caughtError: "error",
                            result: "catch result"
                        }, done, {
                            body: throws("error"),
                            catchBody: returns("catch result")
                        });
                    });
                });
                context("catch throws", function() {
                    return it("returns the catch error", function(done) {
                        return whenTheThenAndWhenFinished({
                            catchBodyExecuted: true,
                            caughtError: "error",
                            error: "catch error"
                        }, done, {
                            body: throws("error"),
                            catchBody: throws("catch error")
                        });
                    });
                });
                return context("catch returns error", function() {
                    return it("returns the catch error", function(done) {
                        return whenTheThenAndWhenFinished({
                            catchBodyExecuted: true,
                            caughtError: "error",
                            error: "catch error"
                        }, done, {
                            body: throws("error"),
                            catchBody: returnsError("catch error")
                        });
                    });
                });
            });
            return context("body returns error", function() {
                context("catch returns", function() {
                    return it("returns the catch result", function(done) {
                        return whenTheThenAndWhenFinished({
                            catchBodyExecuted: true,
                            caughtError: "error",
                            result: "catch result"
                        }, done, {
                            body: returnsError("error"),
                            catchBody: returns("catch result")
                        });
                    });
                });
                context("catch throws", function() {
                    return it("returns the catch error", function(done) {
                        return whenTheThenAndWhenFinished({
                            catchBodyExecuted: true,
                            caughtError: "error",
                            error: "catch error"
                        }, done, {
                            body: returnsError("error"),
                            catchBody: throws("catch error")
                        });
                    });
                });
                return context("catch returns error", function() {
                    return it("returns the catch error", function(done) {
                        return whenTheThenAndWhenFinished({
                            catchBodyExecuted: true,
                            caughtError: "error",
                            error: "catch error"
                        }, done, {
                            body: returnsError("error"),
                            catchBody: returnsError("catch error")
                        });
                    });
                });
            });
        });
        context("with only a finally clause", function() {
            context("body returns", function() {
                context("finally returns", function() {
                    return it("executes the finally body and returns body result", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            result: "result"
                        }, done, {
                            body: returns("result"),
                            finallyBody: returns("finally result")
                        });
                    });
                });
                context("finally throws", function() {
                    return it("executes the finally body and returns finally thrown error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: returns("result"),
                            finallyBody: throws("finally error")
                        });
                    });
                });
                return context("finally returns error", function() {
                    return it("executes the finally body and returns finally returned error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: returns("result"),
                            finallyBody: returnsError("finally error")
                        });
                    });
                });
            });
            context("body throws", function() {
                context("finally returns", function() {
                    return it("executes the finally body and returns body error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "error"
                        }, done, {
                            body: throws("error"),
                            finallyBody: returns("finally result")
                        });
                    });
                });
                context("finally throws", function() {
                    return it("executes the finally body and returns finally thrown error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: throws("error"),
                            finallyBody: throws("finally error")
                        });
                    });
                });
                return context("finally returns error", function() {
                    return it("executes the finally body and returns finally returned error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: throws("error"),
                            finallyBody: returnsError("finally error")
                        });
                    });
                });
            });
            return context("body returns error", function() {
                context("finally returns", function() {
                    return it("executes the finally body and returns body returned error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "error"
                        }, done, {
                            body: returnsError("error"),
                            finallyBody: returns("finally result")
                        });
                    });
                });
                context("finally throws", function() {
                    return it("executes the finally body and returns finally thrown error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: returnsError("error"),
                            finallyBody: throws("finally error")
                        });
                    });
                });
                return context("finally returns error", function() {
                    return it("executes the finally body and returns finally returned error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: returnsError("error"),
                            finallyBody: returnsError("finally error")
                        });
                    });
                });
            });
        });
        return context("with catch and finally clauses", function() {
            context("body returns", function() {
                context("finally returns", function() {
                    return it("executes the finally body and returns body result", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            result: "result"
                        }, done, {
                            body: returns("result"),
                            catchBody: doesNothing,
                            finallyBody: returns("finally result")
                        });
                    });
                });
                context("finally throws", function() {
                    return it("executes the finally body and returns finally thrown error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: returns("result"),
                            catchBody: doesNothing,
                            finallyBody: throws("finally error")
                        });
                    });
                });
                return context("finally returns error", function() {
                    return it("executes the finally body and returns finally returned error", function(done) {
                        return whenTheThenAndWhenFinished({
                            finallyBodyExecuted: true,
                            error: "finally error"
                        }, done, {
                            body: returns("result"),
                            catchBody: doesNothing,
                            finallyBody: returnsError("finally error")
                        });
                    });
                });
            });
            context("body throws", function() {
                context("catch returns", function() {
                    context("finally returns", function() {
                        return it("executes the finally body and returns catch result", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                result: "catch result"
                            }, done, {
                                body: throws("error"),
                                catchBody: returns("catch result"),
                                finallyBody: returns("finally result")
                            });
                        });
                    });
                    context("finally throws", function() {
                        return it("executes the finally body and returns finally thrown error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: throws("error"),
                                catchBody: returns("catch result"),
                                finallyBody: throws("finally error")
                            });
                        });
                    });
                    return context("finally returns error", function() {
                        return it("executes the finally body and returns finally returned error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: throws("error"),
                                catchBody: returns("catch result"),
                                finallyBody: returnsError("finally error")
                            });
                        });
                    });
                });
                context("catch throws", function() {
                    context("finally returns", function() {
                        return it("executes the finally body and returns catch result", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "catch error"
                            }, done, {
                                body: throws("error"),
                                catchBody: throws("catch error"),
                                finallyBody: returns("finally result")
                            });
                        });
                    });
                    context("finally throws", function() {
                        return it("executes the finally body and returns finally thrown error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: throws("error"),
                                catchBody: throws("catch error"),
                                finallyBody: throws("finally error")
                            });
                        });
                    });
                    return context("finally returns error", function() {
                        return it("executes the finally body and returns finally returned error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: throws("error"),
                                catchBody: throws("catch error"),
                                finallyBody: returnsError("finally error")
                            });
                        });
                    });
                });
                return context("catch returns error", function() {
                    context("finally returns", function() {
                        return it("executes the finally body and returns catch result", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "catch error"
                            }, done, {
                                body: throws("error"),
                                catchBody: returnsError("catch error"),
                                finallyBody: returns("finally result")
                            });
                        });
                    });
                    context("finally throws", function() {
                        return it("executes the finally body and returns finally thrown error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: throws("error"),
                                catchBody: returnsError("catch error"),
                                finallyBody: throws("finally error")
                            });
                        });
                    });
                    return context("finally returns error", function() {
                        return it("executes the finally body and returns finally returned error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: throws("error"),
                                catchBody: returnsError("catch error"),
                                finallyBody: returnsError("finally error")
                            });
                        });
                    });
                });
            });
            return context("body returns error", function() {
                context("catch returns", function() {
                    context("finally returns", function() {
                        return it("executes the finally body and returns catch result", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                result: "catch result"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: returns("catch result"),
                                finallyBody: returns("finally result")
                            });
                        });
                    });
                    context("finally throws", function() {
                        return it("executes the finally body and returns finally thrown error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: returns("catch result"),
                                finallyBody: throws("finally error")
                            });
                        });
                    });
                    return context("finally returns error", function() {
                        return it("executes the finally body and returns finally returned error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: returns("catch result"),
                                finallyBody: returnsError("finally error")
                            });
                        });
                    });
                });
                context("catch throws", function() {
                    context("finally returns", function() {
                        return it("executes the finally body and returns catch result", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "catch error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: throws("catch error"),
                                finallyBody: returns("finally result")
                            });
                        });
                    });
                    context("finally throws", function() {
                        return it("executes the finally body and returns finally thrown error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: throws("catch error"),
                                finallyBody: throws("finally error")
                            });
                        });
                    });
                    return context("finally returns error", function() {
                        return it("executes the finally body and returns finally returned error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: throws("catch error"),
                                finallyBody: returnsError("finally error")
                            });
                        });
                    });
                });
                return context("catch returns error", function() {
                    context("finally returns", function() {
                        return it("executes the finally body and returns catch result", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "catch error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: returnsError("catch error"),
                                finallyBody: returns("finally result")
                            });
                        });
                    });
                    context("finally throws", function() {
                        return it("executes the finally body and returns finally thrown error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: returnsError("catch error"),
                                finallyBody: throws("finally error")
                            });
                        });
                    });
                    return context("finally returns error", function() {
                        return it("executes the finally body and returns finally returned error", function(done) {
                            return whenTheThenAndWhenFinished({
                                catchBodyExecuted: true,
                                caughtError: "error",
                                finallyBodyExecuted: true,
                                error: "finally error"
                            }, done, {
                                body: returnsError("error"),
                                catchBody: returnsError("catch error"),
                                finallyBody: returnsError("finally error")
                            });
                        });
                    });
                });
            });
        });
    });
}).call(this);
});
require("/test/asyncTrySpec.pogo");

require.define("/test/asyncWhileSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var async, should;
    async = require("../lib/asyncControl");
    should = require("should");
    describe("while statement", function() {
        var throws, returnsError, returns, returnsTrue, returnsFalse, doesNothing, whenWhileHasTheFollowingLoopsThenAndDone;
        throws = function(error) {
            var withCallback;
            return withCallback = function(callback) {
                throw error;
            };
        };
        returnsError = function(error) {
            var withCallback;
            return withCallback = function(callback) {
                return callback(error);
            };
        };
        returns = function(result) {
            var withCallback;
            return withCallback = function(callback) {
                return callback(void 0, result);
            };
        };
        returnsTrue = returns(true);
        returnsFalse = returns(false);
        doesNothing = function(callback) {
            return callback();
        };
        whenWhileHasTheFollowingLoopsThenAndDone = function(loops, assertions, done) {
            var currentLoopIndex, loopsExecuted, currentLoop, condition, loop;
            currentLoopIndex = 0;
            loopsExecuted = 0;
            currentLoop = void 0;
            condition = function(callback) {
                currentLoop = loops[currentLoopIndex];
                ++currentLoopIndex;
                return currentLoop.condition(callback);
            };
            loop = function(callback) {
                ++loopsExecuted;
                return currentLoop.loop(callback);
            };
            return async.while(condition, loop, function(error, result) {
                try {
                    should.equal(error, assertions.error);
                    should.equal(result, void 0);
                    should.equal(loopsExecuted, assertions.loopsExecuted);
                    return done();
                } catch (error) {
                    return done(error);
                }
            });
        };
        context("condition starts false", function() {
            return it("skips the while statement", function(done) {
                return whenWhileHasTheFollowingLoopsThenAndDone([ {
                    condition: returnsFalse,
                    loop: doesNothing
                } ], {
                    loopsExecuted: 0
                }, done);
            });
        });
        context("when the condition is true for the first 5 times", function() {
            return it("executes the loop once", function(done) {
                return whenWhileHasTheFollowingLoopsThenAndDone([ {
                    condition: returnsTrue,
                    loop: doesNothing
                }, {
                    condition: returnsTrue,
                    loop: doesNothing
                }, {
                    condition: returnsTrue,
                    loop: doesNothing
                }, {
                    condition: returnsTrue,
                    loop: doesNothing
                }, {
                    condition: returnsTrue,
                    loop: doesNothing
                }, {
                    condition: returnsFalse,
                    loop: doesNothing
                } ], {
                    loopsExecuted: 5
                }, done);
            });
        });
        context("condition returns true", function() {
            context("loop returns", function() {
                return it("ignores the loop result", function(done) {
                    return whenWhileHasTheFollowingLoopsThenAndDone([ {
                        condition: returnsTrue,
                        loop: returns("result 1")
                    }, {
                        condition: returnsTrue,
                        loop: returns("result 2")
                    }, {
                        condition: returnsFalse,
                        loop: returns("result 3")
                    } ], {
                        loopsExecuted: 2
                    }, done);
                });
            });
            context("loop throws", function() {
                return it("returns the loop error", function(done) {
                    return whenWhileHasTheFollowingLoopsThenAndDone([ {
                        condition: returnsTrue,
                        loop: throws("error")
                    }, {
                        condition: returnsTrue,
                        loop: returns("result 2")
                    }, {
                        condition: returnsFalse,
                        loop: returns("result 3")
                    } ], {
                        loopsExecuted: 1,
                        error: "error"
                    }, done);
                });
            });
            return context("loop returns error", function() {
                return it("returns the loop error", function(done) {
                    return whenWhileHasTheFollowingLoopsThenAndDone([ {
                        condition: returnsTrue,
                        loop: returnsError("error")
                    }, {
                        condition: returnsTrue,
                        loop: returns("result 2")
                    }, {
                        condition: returnsFalse,
                        loop: returns("result 3")
                    } ], {
                        loopsExecuted: 1,
                        error: "error"
                    }, done);
                });
            });
        });
        context("condition throws", function() {
            return it("ignores the loop result", function(done) {
                return whenWhileHasTheFollowingLoopsThenAndDone([ {
                    condition: throws("condition error"),
                    loop: doesNothing
                } ], {
                    loopsExecuted: 0,
                    error: "condition error"
                }, done);
            });
        });
        return context("condition returns error", function() {
            return it("ignores the loop result", function(done) {
                return whenWhileHasTheFollowingLoopsThenAndDone([ {
                    condition: returnsError("condition error"),
                    loop: doesNothing
                } ], {
                    loopsExecuted: 0,
                    error: "condition error"
                }, done);
            });
        });
    });
}).call(this);
});
require("/test/asyncWhileSpec.pogo");

require.define("/test/basicExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var cg, assert;
    cg = require("../lib/parser/codeGenerator").codeGenerator();
    require("./assertions");
    assert = require("assert");
    describe("basic expression", function() {
        var withTerminalsShouldNotHaveArguments, withTerminalsShouldHaveArguments, variable, block, id, int, string, asyncArgument;
        withTerminalsShouldNotHaveArguments = function(terminals) {
            var ex;
            ex = cg.basicExpression(terminals);
            return shouldBeFalsy(ex.hasArguments());
        };
        withTerminalsShouldHaveArguments = function(terminals) {
            var ex;
            ex = cg.basicExpression(terminals);
            return shouldBeTruthy(ex.hasArguments());
        };
        variable = cg.variable([ "a" ]);
        block = cg.block([], cg.statements([ variable ]));
        id = function(name) {
            return cg.identifier(name);
        };
        int = function(n) {
            return cg.integer(n);
        };
        string = function(n) {
            return cg.string(n);
        };
        asyncArgument = cg.asyncArgument();
        describe("has arguments", function() {
            it("with one variable", function() {
                return withTerminalsShouldHaveArguments([ variable ]);
            });
            it("with a block", function() {
                return withTerminalsShouldHaveArguments([ block ]);
            });
            it("with name and a block", function() {
                return withTerminalsShouldHaveArguments([ id("c"), block ]);
            });
            it("with name, no arguments but an async argument", function() {
                return withTerminalsShouldHaveArguments([ id("c"), asyncArgument ]);
            });
            return it("with name and empty argument list", function() {
                return withTerminalsShouldHaveArguments([ id("c"), cg.argumentList([]) ]);
            });
        });
        describe("doesnt have arguments", function() {
            it("with just an identifier", function() {
                return withTerminalsShouldNotHaveArguments([ id("a") ]);
            });
            return it("with two identifiers", function() {
                return withTerminalsShouldNotHaveArguments([ id("a"), id("b") ]);
            });
        });
        describe("arguments", function() {
            var terminalsShouldHaveArguments;
            terminalsShouldHaveArguments = function(terminals, arguments) {
                return shouldContainFields(cg.basicExpression(terminals).arguments(), arguments);
            };
            it("single variable", function() {
                return terminalsShouldHaveArguments([ variable ], [ variable ]);
            });
            it("variable with name", function() {
                return terminalsShouldHaveArguments([ id("move"), variable ], [ variable ]);
            });
            it("with name and empty argument list", function() {
                return terminalsShouldHaveArguments([ id("c"), cg.argumentList([]) ], []);
            });
            it("block", function() {
                return terminalsShouldHaveArguments([ block ], [ {
                    isBlock: true,
                    body: {
                        statements: [ {
                            isVariable: true,
                            variable: [ "a" ]
                        } ]
                    }
                } ]);
            });
            it("block with a parameter", function() {
                return terminalsShouldHaveArguments([ cg.parameters([ cg.variable([ "x" ]) ]), block ], [ {
                    isBlock: true,
                    parameters: [ {
                        variable: [ "x" ]
                    } ],
                    body: {
                        statements: [ {
                            isVariable: true,
                            variable: [ "a" ]
                        } ]
                    }
                } ]);
            });
            return describe("having async argument", function() {
                it("has async argument when at end", function() {
                    return shouldBeTruthy(cg.basicExpression([ id("stuff"), asyncArgument ]).hasAsyncArgument());
                });
                return it("has async argument when in middle", function() {
                    return shouldBeTruthy(cg.basicExpression([ id("stuff"), asyncArgument, id("ok") ]).hasAsyncArgument());
                });
            });
        });
        describe("parameters", function() {
            var targetHasSomeParameters, targetDoesntHaveSomeParameters, targetHasParameters, targetHasOptionalParameters;
            targetHasSomeParameters = function(expression) {
                return shouldBeTruthy(cg.basicExpression(expression).hasParameters());
            };
            targetDoesntHaveSomeParameters = function(expression) {
                return shouldBeFalsy(cg.basicExpression(expression).hasParameters());
            };
            targetHasParameters = function(expression, parameters) {
                return shouldContainFields(cg.basicExpression(expression).parameters(), parameters);
            };
            targetHasOptionalParameters = function(expression, parameters) {
                return shouldContainFields(cg.basicExpression(expression).optionalParameters(), parameters);
            };
            it("single name", function() {
                return targetDoesntHaveSomeParameters([ id("car") ]);
            });
            describe("name and variable", function() {
                it("has parameters", function() {
                    return targetHasSomeParameters([ id("car"), variable ]);
                });
                return it("parameters", function() {
                    return targetHasParameters([ id("car"), variable ], [ {
                        variable: [ "a" ]
                    } ]);
                });
            });
            describe("name and optional", function() {
                it("has parameters", function() {
                    return targetHasSomeParameters([ id("car"), cg.hashEntry([ "colour" ], cg.variable([ "red" ])) ]);
                });
                it("parameters", function() {
                    return targetHasParameters([ id("car"), cg.hashEntry([ "colour" ], cg.variable([ "red" ])) ], []);
                });
                return it("optional parameters", function() {
                    return targetHasOptionalParameters([ id("car"), cg.hashEntry([ "colour" ], cg.variable([ "red" ])) ], [ {
                        field: [ "colour" ],
                        value: {
                            variable: [ "red" ]
                        }
                    } ]);
                });
            });
            describe("async argument", function() {
                it("has parameters", function() {
                    return targetHasSomeParameters([ id("car"), asyncArgument ]);
                });
                return it("parameters", function() {
                    return targetHasParameters([ id("car"), asyncArgument ], []);
                });
            });
            return describe("empty argument list", function() {
                it("has parameters", function() {
                    return targetHasSomeParameters([ id("car"), cg.argumentList([]) ]);
                });
                return it("parameters", function() {
                    return targetHasParameters([ id("car"), cg.argumentList([]) ], []);
                });
            });
        });
        describe("has name", function() {
            var terminalsShouldHaveAName;
            terminalsShouldHaveAName = function(terminals) {
                return shouldBeTruthy(cg.basicExpression(terminals).hasName());
            };
            return it("with two identifiers", function() {
                return terminalsShouldHaveAName([ id("car"), id("idle") ]);
            });
        });
        describe("name", function() {
            var terminalsShouldHaveName;
            terminalsShouldHaveName = function(terminals, name) {
                return shouldContainFields(cg.basicExpression(terminals).name(), name);
            };
            it("with two identifiers", function() {
                return terminalsShouldHaveName([ id("car"), id("idle") ], [ "car", "idle" ]);
            });
            return it("with two identifiers and arg", function() {
                return terminalsShouldHaveName([ id("car"), cg.variable([ "car" ]), id("idle") ], [ "car", "idle" ]);
            });
        });
        describe("hash entry", function() {
            var hashEntryShouldContainFields;
            hashEntryShouldContainFields = function(terminals, f) {
                return shouldContainFields(cg.basicExpression(terminals).hashEntry(), f);
            };
            it("with an argument", function() {
                return hashEntryShouldContainFields([ id("port"), int(10) ], {
                    isHashEntry: true,
                    field: [ "port" ],
                    value: {
                        integer: 10
                    }
                });
            });
            it("without an argument", function() {
                return hashEntryShouldContainFields([ id("port") ], {
                    isHashEntry: true,
                    field: [ "port" ],
                    value: undefined
                });
            });
            return it("with a string name", function() {
                return hashEntryShouldContainFields([ string("the port"), int(8) ], {
                    isHashEntry: true,
                    field: {
                        string: "the port"
                    },
                    value: {
                        integer: 8
                    }
                });
            });
        });
        describe("hash entry, without block", function() {
            var hashEntryShouldContainFields;
            hashEntryShouldContainFields = function(terminals, f) {
                return shouldContainFields(cg.basicExpression(terminals).hashEntry({
                    withoutBlock: true
                }), f);
            };
            it("with block", function() {
                return hashEntryShouldContainFields([ id("port"), int(10), block ], {
                    isHashEntry: true,
                    field: [ "port" ],
                    value: {
                        integer: 10
                    }
                });
            });
            return it("without arguments", function() {
                return hashEntryShouldContainFields([ id("port") ], {
                    isHashEntry: true,
                    field: [ "port" ],
                    value: undefined
                });
            });
        });
        describe("hash entry block", function() {
            var hashEntryBlockShouldContainFields;
            hashEntryBlockShouldContainFields = function(terminals, f) {
                return shouldContainFields(cg.basicExpression(terminals).hashEntryBlock(), f);
            };
            it("with block", function() {
                return hashEntryBlockShouldContainFields([ id("port"), int(10), block ], {
                    isBlock: true,
                    body: {
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    }
                });
            });
            it("without block", function() {
                return assert.equal(cg.basicExpression([ id("port"), int(10) ]).hashEntryBlock(), undefined);
            });
            return it("without hash", function() {
                return assert.equal(cg.basicExpression([ id("port") ]).hashEntryBlock(), undefined);
            });
        });
        return describe("hash key", function() {
            it("if string then should return string", function() {
                var key;
                key = cg.basicExpression([ string("port") ]).hashKey();
                return shouldContainFields(key, {
                    string: "port"
                });
            });
            return it("if variable then should return array containing string", function() {
                var key;
                key = cg.basicExpression([ id("port") ]).hashKey();
                return shouldContainFields(key, [ "port" ]);
            });
        });
    });
}).call(this);
});
require("/test/basicExpressionSpec.pogo");

require.define("/test/classSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    require("../lib/class");
    describe("class", function() {
        it("can create constructors that can be used in new", function() {
            var something, s;
            something = $class({
                constructor: function(thing) {
                    var self = this;
                    return self.thing = thing;
                }
            });
            s = new something("thing");
            return s.thing.should.equal("thing");
        });
        it("can create constructor, even if the class doesn't define one", function() {
            var something, s;
            something = $class({
                thing: "thing"
            });
            s = new something;
            return s.thing.should.equal("thing");
        });
        it("allows methods to be inherited", function() {
            var base, derived, d;
            base = $class({
                aMethod: function() {
                    var self = this;
                    return "method result";
                }
            });
            derived = classExtending(base, {
                constructor: function() {
                    var self = this;
                }
            });
            d = new derived;
            return d.aMethod().should.equal("method result");
        });
        it("a derived class can be derived again", function() {
            var base, derived, derivedDerived, d;
            base = $class({
                aMethod: function() {
                    var self = this;
                    return "method result";
                }
            });
            derived = classExtending(base, {
                constructor: function() {
                    var self = this;
                    return void 0;
                }
            });
            derivedDerived = classExtending(derived, {
                constructor: function() {
                    var self = this;
                    return void 0;
                }
            });
            d = new derivedDerived;
            return d.aMethod().should.equal("method result");
        });
        it("allows derived class to override method", function() {
            var base, derived, d;
            base = $class({
                aMethod: function() {
                    var self = this;
                    return "base result";
                }
            });
            derived = classExtending(base, {
                aMethod: function() {
                    var self = this;
                    return "derived result";
                }
            });
            d = new derived;
            return d.aMethod().should.equal("derived result");
        });
        return it("allows constructors to be inherited", function() {
            var base, derived, d;
            base = $class({
                constructor: function(value) {
                    var self = this;
                    return self.value = value;
                }
            });
            derived = classExtending(base, {});
            d = new derived("value");
            return d.value.should.equal("value");
        });
    });
}).call(this);
});
require("/test/classSpec.pogo");

require.define("/test/closureParameterStrategiesSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, strategies, MemoryStream, should;
    terms = require("../lib/parser/codeGenerator").codeGenerator();
    strategies = require("../lib/terms/closureParameterStrategies")(terms);
    MemoryStream = require("../lib/memorystream").MemoryStream;
    should = require("should");
    describe("closure parameter strategies", function() {
        var generateWithBufferAndScope, generateParametersFrom, generateStatementsFrom;
        generateWithBufferAndScope = function(block) {
            var scope, buffer;
            scope = new terms.SymbolScope;
            buffer = new MemoryStream;
            block(buffer, scope);
            return buffer.toString();
        };
        generateParametersFrom = function(strategy) {
            return generateWithBufferAndScope(function(buffer, scope) {
                return strategy.generateJavaScriptParameters(buffer, scope);
            });
        };
        generateStatementsFrom = function(strategy) {
            return generateWithBufferAndScope(function(buffer, scope) {
                return strategy.generateJavaScriptParameterStatements(buffer, scope, terms.variable([ "args" ]));
            });
        };
        describe("function strategy", function() {
            return context("when there are two arguments", function() {
                var fs;
                fs = void 0;
                beforeEach(function() {
                    return fs = strategies.functionStrategy({
                        namedParameters: function() {
                            var self = this;
                            return [ terms.variable([ "a" ]), terms.variable([ "b" ]) ];
                        },
                        generateJavaScriptParameterStatements: function(buffer, scope, arguments) {
                            var self = this;
                            arguments.generateJavaScript(buffer, scope);
                            return buffer.write(";");
                        }
                    });
                });
                it("generates a function parameter for each required parameter", function() {
                    return generateParametersFrom(fs).should.equal("a,b");
                });
                it("generates statements of underlying strategy", function() {
                    return generateStatementsFrom(fs).should.equal("args;");
                });
                return it("requires underlying named parameters", function() {
                    return should.deepEqual(fs.namedParameters(), [ terms.variable([ "a" ]), terms.variable([ "b" ]) ]);
                });
            });
        });
        describe("normal strategy", function() {
            return context("when there are two parameters", function() {
                var n;
                n = void 0;
                beforeEach(function() {
                    return n = strategies.normalStrategy([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]);
                });
                it("requires those parameters", function() {
                    return should.deepEqual(n.namedParameters(), [ terms.variable([ "a" ]), terms.variable([ "b" ]) ]);
                });
                return it("doesn't generate any statements", function() {
                    return generateStatementsFrom(n).should.equal("");
                });
            });
        });
        describe("splat strategy", function() {
            context("when there is only one splat parameter", function() {
                var splat;
                splat = void 0;
                beforeEach(function() {
                    return splat = strategies.splatStrategy({
                        before: [],
                        splat: terms.variable([ "a" ]),
                        after: []
                    });
                });
                it("doesn't require any parameters", function() {
                    return should.deepEqual(splat.namedParameters(), []);
                });
                return it("generates full slice of arguments", function() {
                    return generateStatementsFrom(splat).should.equal("var a=Array.prototype.slice.call(args,0,args.length);");
                });
            });
            context("when there is one argument before the splat parameter", function() {
                var splat;
                splat = void 0;
                beforeEach(function() {
                    return splat = strategies.splatStrategy({
                        before: [ terms.variable([ "a" ]) ],
                        splat: terms.variable([ "b" ]),
                        after: []
                    });
                });
                it("doesn't require any parameters", function() {
                    return should.deepEqual(splat.namedParameters(), [ terms.variable([ "a" ]) ]);
                });
                return it("generates full slice of arguments", function() {
                    return generateStatementsFrom(splat).should.equal("var b=Array.prototype.slice.call(args,1,args.length);");
                });
            });
            context("when there is one argument after the splat parameter", function() {
                var splat;
                splat = void 0;
                beforeEach(function() {
                    return splat = strategies.splatStrategy({
                        before: [],
                        splat: terms.variable([ "a" ]),
                        after: [ terms.variable([ "b" ]) ]
                    });
                });
                it("doesn't require any parameters", function() {
                    return should.deepEqual(splat.namedParameters(), []);
                });
                return it("generates full slice of arguments", function() {
                    return generateStatementsFrom(splat).should.equal("var a=Array.prototype.slice.call(args,0,args.length-1);var b=args[args.length-1];");
                });
            });
            return context("when there is one argument, a splat argument, then another argument", function() {
                var splat;
                splat = void 0;
                beforeEach(function() {
                    return splat = strategies.splatStrategy({
                        before: [ terms.variable([ "a" ]) ],
                        splat: terms.variable([ "b" ]),
                        after: [ terms.variable([ "c" ]) ]
                    });
                });
                it("doesn't require any parameters", function() {
                    return should.deepEqual(splat.namedParameters(), [ terms.variable([ "a" ]) ]);
                });
                return it("generates full slice of arguments", function() {
                    return generateStatementsFrom(splat).should.equal("var b=Array.prototype.slice.call(args,1,args.length-1);if(args.length>1){var c=args[args.length-1];}");
                });
            });
        });
        describe("optional strategy", function() {
            context("when there are no other arguments", function() {
                var opts;
                opts = void 0;
                beforeEach(function() {
                    return opts = strategies.optionalStrategy({
                        before: [],
                        options: [ terms.hashEntry([ "a" ], terms.integer(10)), terms.hashEntry([ "b" ], terms.string("asdf")) ]
                    });
                });
                it("requires only an options parameter", function() {
                    return should.deepEqual(opts.namedParameters(), [ terms.generatedVariable([ "options" ]) ]);
                });
                return it("generates code to extract each named option from the options variable", function() {
                    return generateStatementsFrom(opts).should.equal("var a,b;a=gen1_options!==void 0&&Object.prototype.hasOwnProperty.call(gen1_options,'a')&&gen1_options.a!==void 0?gen1_options.a:10;b=gen1_options!==void 0&&Object.prototype.hasOwnProperty.call(gen1_options,'b')&&gen1_options.b!==void 0?gen1_options.b:'asdf';");
                });
            });
            return context("when there are two other parameters", function() {
                var opts;
                opts = void 0;
                beforeEach(function() {
                    return opts = strategies.optionalStrategy({
                        before: [ terms.variable([ "a" ]), terms.variable([ "b" ]) ],
                        options: [ terms.hashEntry([ "c" ], terms.integer(10)), terms.hashEntry([ "d" ], terms.string("asdf")) ]
                    });
                });
                it("requires the normal parameters and the options parameter", function() {
                    return should.deepEqual(opts.namedParameters(), [ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.generatedVariable([ "options" ]) ]);
                });
                return it("generates code to extract each named option from the options variable", function() {
                    return generateStatementsFrom(opts).should.equal("var c,d;c=gen1_options!==void 0&&Object.prototype.hasOwnProperty.call(gen1_options,'c')&&gen1_options.c!==void 0?gen1_options.c:10;d=gen1_options!==void 0&&Object.prototype.hasOwnProperty.call(gen1_options,'d')&&gen1_options.d!==void 0?gen1_options.d:'asdf';");
                });
            });
        });
        return describe("callback strategy", function() {
            return context("with two other parameters", function() {
                var cb;
                cb = void 0;
                beforeEach(function() {
                    return cb = strategies.callbackStrategy({
                        namedParameters: function() {
                            var self = this;
                            return [ terms.variable([ "a" ]), terms.variable([ "b" ]) ];
                        },
                        generateJavaScriptParameterStatements: function(buffer, scope, args) {
                            var self = this;
                            args.generateJavaScript(buffer, scope);
                            return buffer.write(";");
                        }
                    });
                });
                it("requires the inner parameters and the callback", function() {
                    return should.deepEqual(cb.namedParameters(), [ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.callbackFunction ]);
                });
                return it("generates code to extract the callback and the other parameters", function() {
                    return generateStatementsFrom(cb).should.equal("var gen1_arguments=Array.prototype.slice.call(args,0,args.length-1);continuation=args[args.length-1];if(!(continuation instanceof Function)){throw new Error('asynchronous function called synchronously');}a=gen1_arguments[0];b=gen1_arguments[1];gen1_arguments;");
                });
            });
        });
    });
}).call(this);
});
require("/test/closureParameterStrategiesSpec.pogo");

require.define("/test/closureSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, shouldContainFields;
    terms = require("../lib/parser/codeGenerator").codeGenerator();
    shouldContainFields = require("./containsFields").containsFields;
    describe("closure", function() {
        describe("asyncify", function() {
            context("when the body is not asynchronous", function() {
                return it("makes sure that the result is passed to a callback", function() {
                    var closure;
                    closure = terms.closure([], terms.statements([ terms.variable([ "asdf" ]) ]));
                    closure.asyncify();
                    return shouldContainFields(closure, terms.closure([], terms.statements([ terms.functionCall(terms.callbackFunction, [ terms.nil(), terms.variable([ "asdf" ]) ]) ], {
                        async: true
                    }), {
                        async: true
                    }));
                });
            });
            return context("when the body is asynchronous", function() {
                return it("does nothing", function() {
                    var closure;
                    closure = terms.closure([], terms.statements([ terms.variable([ "asdf" ]) ], {
                        async: true
                    }));
                    closure.asyncify();
                    return shouldContainFields(closure, terms.closure([], terms.statements([ terms.variable([ "asdf" ]) ], {
                        async: true
                    }), {
                        async: true
                    }));
                });
            });
        });
        return describe("parameter strategy selection", function() {
            var strats, statements;
            strats = terms.closureParameterStrategies;
            statements = void 0;
            beforeEach(function() {
                return statements = terms.statements([ terms.variable([ "a" ]) ]);
            });
            context("when there are only normal parameters", function() {
                return it("selects the normal strategy", function() {
                    var closure;
                    closure = terms.closure([ terms.variable([ "a" ]) ], statements);
                    return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.normalStrategy([ terms.variable([ "a" ]) ])));
                });
            });
            describe("splat parameters", function() {
                context("when there is a splat parameter and no others", function() {
                    return it("selects the splat strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "a" ]), terms.splat() ], statements);
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.splatStrategy({
                            before: [],
                            splat: terms.variable([ "a" ]),
                            after: []
                        })));
                    });
                });
                context("when there is a parameter, then a splat parameter and no others", function() {
                    return it("selects the splat strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.splat() ], statements);
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.splatStrategy({
                            before: [ terms.variable([ "a" ]) ],
                            splat: terms.variable([ "b" ]),
                            after: []
                        })));
                    });
                });
                context("when there is a splat parameter and then a normal parameter", function() {
                    return it("selects the splat strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "a" ]), terms.splat(), terms.variable([ "b" ]) ], statements);
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.splatStrategy({
                            before: [],
                            splat: terms.variable([ "a" ]),
                            after: [ terms.variable([ "b" ]) ]
                        })));
                    });
                });
                return context("when there is a normal parameter, then a splat parameter and then a normal parameter", function() {
                    return it("selects the splat strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.splat(), terms.variable([ "c" ]) ], statements);
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.splatStrategy({
                            before: [ terms.variable([ "a" ]) ],
                            splat: terms.variable([ "b" ]),
                            after: [ terms.variable([ "c" ]) ]
                        })));
                    });
                });
            });
            describe("optional parameters", function() {
                context("when there are only optional parameters", function() {
                    return it("uses the optional strategy", function() {
                        var closure;
                        closure = terms.closure([], statements, {
                            optionalParameters: [ terms.hashEntry([ "a" ], terms.integer(90)), terms.hashEntry([ "b" ], terms.string("hi")) ]
                        });
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.optionalStrategy({
                            before: [],
                            options: [ terms.hashEntry([ "a" ], terms.integer(90)), terms.hashEntry([ "b" ], terms.string("hi")) ]
                        })));
                    });
                });
                return context("when there is one normal parameter and two optional parameters", function() {
                    return it("uses the optional strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "x" ]) ], statements, {
                            optionalParameters: [ terms.hashEntry([ "a" ], terms.integer(90)), terms.hashEntry([ "b" ], terms.string("hi")) ]
                        });
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.optionalStrategy({
                            before: [ terms.variable([ "x" ]) ],
                            options: [ terms.hashEntry([ "a" ], terms.integer(90)), terms.hashEntry([ "b" ], terms.string("hi")) ]
                        })));
                    });
                });
            });
            return describe("functions that take an async callback parameter", function() {
                context("when there are just normal parameters", function() {
                    return it("chooses the callback strategy containing a normal strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "a" ]) ], statements, {
                            async: true
                        });
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.callbackStrategy(strats.normalStrategy([ terms.variable([ "a" ]) ]))));
                    });
                });
                context("when there is one normal parameter and two optional parameters", function() {
                    return it("uses the optional strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "x" ]) ], statements, {
                            optionalParameters: [ terms.hashEntry([ "a" ], terms.integer(90)), terms.hashEntry([ "b" ], terms.string("hi")) ],
                            async: true
                        });
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.callbackStrategy(strats.optionalStrategy({
                            before: [ terms.variable([ "x" ]) ],
                            options: [ terms.hashEntry([ "a" ], terms.integer(90)), terms.hashEntry([ "b" ], terms.string("hi")) ]
                        }))));
                    });
                });
                return context("when there is a normal parameter, then a splat parameter and then a normal parameter", function() {
                    return it("selects the splat strategy", function() {
                        var closure;
                        closure = terms.closure([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.splat(), terms.variable([ "c" ]) ], statements, {
                            async: true
                        });
                        return shouldContainFields(closure.parametersStrategy(), strats.functionStrategy(strats.callbackStrategy(strats.splatStrategy({
                            before: [ terms.variable([ "a" ]) ],
                            splat: terms.variable([ "b" ]),
                            after: [ terms.variable([ "c" ]) ]
                        }))));
                    });
                });
            });
        });
    });
}).call(this);
});
require("/test/closureSpec.pogo");

require.define("/test/complexExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var cg, int, loc, id, variable, parameter, block, string, asyncArgument;
    cg = require("../lib/parser/codeGenerator").codeGenerator();
    require("./assertions");
    int = function(n) {
        return cg.integer(n);
    };
    loc = {
        firstLine: 1,
        lastLine: 1,
        firstColumn: 7,
        lastColumn: 13
    };
    id = function(name) {
        return cg.loc(cg.identifier(name), loc);
    };
    variable = function(name) {
        return cg.variable([ name ]);
    };
    parameter = function(name) {
        return cg.parameter([ name ]);
    };
    block = cg.block([], cg.statements([ variable("x") ]));
    string = function(value) {
        return cg.string(value);
    };
    asyncArgument = cg.asyncArgument();
    describe("complex expression", function() {
        describe("has arguments", function() {
            var expressionShouldHaveArguments;
            expressionShouldHaveArguments = function(e) {
                return shouldBeTruthy(cg.complexExpression(e).hasArguments());
            };
            it("with arguments in head", function() {
                return expressionShouldHaveArguments([ [ id("a"), int(10) ] ]);
            });
            it("with async argument", function() {
                return expressionShouldHaveArguments([ [ id("a"), asyncArgument ] ]);
            });
            return it("with tail block", function() {
                return expressionShouldHaveArguments([ [ id("a") ], [ id("readonly"), block ] ]);
            });
        });
        describe("arguments", function() {
            var expressionShouldHaveArguments;
            expressionShouldHaveArguments = function(e, a) {
                return shouldContainFields(cg.complexExpression(e).arguments(), a);
            };
            it("with arguments in head", function() {
                return expressionShouldHaveArguments([ [ id("a"), int(10) ] ], [ {
                    integer: 10
                } ]);
            });
            return it("with tail block", function() {
                return expressionShouldHaveArguments([ [ id("a") ], [ id("readonly"), block ] ], [ {
                    isBlock: true
                } ]);
            });
        });
        describe("expression", function() {
            var expressionShouldContainFields;
            expressionShouldContainFields = function(e, f) {
                return shouldContainFields(cg.complexExpression(e).expression(), f);
            };
            it("with just one argument is that argument", function() {
                return expressionShouldContainFields([ [ int(9) ] ], {
                    isInteger: true,
                    integer: 9
                });
            });
            it("all arguments is function call, first argument is function", function() {
                return expressionShouldContainFields([ [ variable("z"), int(9) ] ], {
                    isFunctionCall: true,
                    isAsync: false,
                    "function": {
                        variable: [ "z" ]
                    },
                    functionArguments: [ {
                        integer: 9
                    } ]
                });
            });
            describe("async functions", function() {
                it("one argument and async argument is async function call", function() {
                    return expressionShouldContainFields([ [ variable("z"), asyncArgument ] ], {
                        isSubStatements: true,
                        statements: [ {
                            isDefinition: true,
                            isAsync: true,
                            target: {
                                isVariable: true,
                                name: [ "async", "result" ]
                            },
                            source: {
                                isFunctionCall: true,
                                "function": {
                                    variable: [ "z" ]
                                },
                                functionArguments: []
                            }
                        }, {
                            isVariable: true,
                            name: [ "async", "result" ]
                        } ]
                    });
                });
                return it("name and async argument is function call", function() {
                    return expressionShouldContainFields([ [ id("z"), asyncArgument ] ], {
                        isSubStatements: true,
                        statements: [ {
                            isDefinition: true,
                            isAsync: true,
                            target: {
                                isVariable: true,
                                name: [ "async", "result" ]
                            },
                            source: {
                                isFunctionCall: true,
                                "function": {
                                    variable: [ "z" ]
                                },
                                functionArguments: []
                            }
                        }, {
                            isVariable: true,
                            name: [ "async", "result" ]
                        } ]
                    });
                });
            });
            it("with name is variable", function() {
                return expressionShouldContainFields([ [ id("a"), id("variable") ] ], {
                    isVariable: true,
                    variable: [ "a", "variable" ]
                });
            });
            it("with name and argument is function call", function() {
                return expressionShouldContainFields([ [ id("a"), id("variable"), int(10) ] ], {
                    isFunctionCall: true,
                    isAsync: false,
                    "function": {
                        isVariable: true,
                        variable: [ "a", "variable" ]
                    },
                    functionArguments: [ {
                        integer: 10
                    } ]
                });
            });
            it("hash entries as arguments are optional", function() {
                return expressionShouldContainFields([ [ id("a"), int(10), cg.hashEntry([ "port" ], int(80)) ] ], {
                    isFunctionCall: true,
                    isAsync: false,
                    "function": {
                        isVariable: true,
                        variable: [ "a" ]
                    },
                    functionArguments: [ {
                        integer: 10
                    } ],
                    optionalArguments: [ {
                        field: [ "port" ],
                        value: {
                            integer: 80
                        }
                    } ]
                });
            });
            it("with name and optional args is function call with optional args", function() {
                return expressionShouldContainFields([ [ id("a"), id("variable") ], [ id("port"), int(80) ] ], {
                    isFunctionCall: true,
                    isAsync: false,
                    "function": {
                        isVariable: true,
                        variable: [ "a", "variable" ]
                    },
                    functionArguments: [],
                    optionalArguments: [ {
                        field: [ "port" ],
                        value: {
                            integer: 80
                        }
                    } ]
                });
            });
            return it("with block after optional arguments", function() {
                return expressionShouldContainFields([ [ id("a"), id("variable") ], [ id("port"), int(80), block ] ], {
                    isFunctionCall: true,
                    isAsync: false,
                    "function": {
                        isVariable: true,
                        variable: [ "a", "variable" ]
                    },
                    functionArguments: [ {
                        isBlock: true,
                        body: {
                            statements: [ {
                                variable: [ "x" ]
                            } ]
                        }
                    } ],
                    optionalArguments: [ {
                        field: [ "port" ],
                        value: {
                            integer: 80
                        }
                    } ]
                });
            });
        });
        describe("object operation -> expression", function() {
            var expressionShouldContainFields;
            expressionShouldContainFields = function(object, operation, fields) {
                return shouldContainFields(cg.complexExpression(operation).objectOperation(object).expression(), fields);
            };
            it("method call", function() {
                return expressionShouldContainFields(variable("a"), [ [ id("method"), int(10) ] ], {
                    isMethodCall: true,
                    object: {
                        variable: [ "a" ]
                    },
                    name: [ "method" ],
                    methodArguments: [ {
                        integer: 10
                    } ],
                    isAsync: false
                });
            });
            it("async method call", function() {
                return expressionShouldContainFields(variable("a"), [ [ id("method"), int(10), asyncArgument ] ], {
                    isSubStatements: true,
                    statements: [ {
                        isDefinition: true,
                        isAsync: true,
                        target: {
                            isVariable: true,
                            name: [ "async", "result" ]
                        },
                        source: {
                            isMethodCall: true,
                            object: {
                                variable: [ "a" ]
                            },
                            name: [ "method" ],
                            methodArguments: [ {
                                integer: 10
                            } ]
                        }
                    }, {
                        isVariable: true,
                        name: [ "async", "result" ]
                    } ]
                });
            });
            it("method call with optional arguments", function() {
                return expressionShouldContainFields(variable("a"), [ [ id("method"), int(10) ], [ id("port"), int(80) ] ], {
                    isMethodCall: true,
                    object: {
                        variable: [ "a" ]
                    },
                    name: [ "method" ],
                    methodArguments: [ {
                        integer: 10
                    } ],
                    optionalArguments: [ {
                        field: [ "port" ],
                        value: {
                            integer: 80
                        }
                    } ],
                    isAsync: false
                });
            });
            it("index", function() {
                return expressionShouldContainFields(variable("a"), [ [ int(10) ] ], {
                    isIndexer: true,
                    object: {
                        variable: [ "a" ]
                    },
                    indexer: {
                        integer: 10
                    }
                });
            });
            it("index call with arguments", function() {
                return expressionShouldContainFields(variable("a"), [ [ variable("z"), int(10) ] ], {
                    isFunctionCall: true,
                    isAsync: false,
                    "function": {
                        isIndexer: true,
                        object: {
                            variable: [ "a" ]
                        },
                        indexer: {
                            variable: [ "z" ]
                        }
                    },
                    functionArguments: [ {
                        integer: 10
                    } ]
                });
            });
            it("async index call with arguments", function() {
                return expressionShouldContainFields(variable("a"), [ [ variable("z"), int(10), asyncArgument ] ], {
                    isSubStatements: true,
                    statements: [ {
                        isDefinition: true,
                        isAsync: true,
                        target: {
                            isVariable: true,
                            name: [ "async", "result" ]
                        },
                        source: {
                            isFunctionCall: true,
                            "function": {
                                isIndexer: true,
                                object: {
                                    variable: [ "a" ]
                                },
                                indexer: {
                                    variable: [ "z" ]
                                }
                            },
                            functionArguments: [ {
                                integer: 10
                            } ]
                        }
                    }, {
                        isVariable: true,
                        name: [ "async", "result" ]
                    } ]
                });
            });
            it("async index call with no arguments", function() {
                return expressionShouldContainFields(variable("a"), [ [ variable("z"), asyncArgument ] ], {
                    isSubStatements: true,
                    statements: [ {
                        isDefinition: true,
                        isAsync: true,
                        target: {
                            isVariable: true,
                            name: [ "async", "result" ]
                        },
                        source: {
                            isFunctionCall: true,
                            "function": {
                                isIndexer: true,
                                object: {
                                    variable: [ "a" ]
                                },
                                indexer: {
                                    variable: [ "z" ]
                                }
                            },
                            functionArguments: []
                        }
                    }, {
                        isVariable: true,
                        name: [ "async", "result" ]
                    } ]
                });
            });
            it("index call with no arguments", function() {
                return expressionShouldContainFields(variable("a"), [ [ variable("z"), cg.argumentList([]) ] ], {
                    isFunctionCall: true,
                    isAsync: false,
                    "function": {
                        isIndexer: true,
                        object: {
                            variable: [ "a" ]
                        },
                        indexer: {
                            variable: [ "z" ]
                        }
                    },
                    functionArguments: []
                });
            });
            return it("field reference", function() {
                return expressionShouldContainFields(variable("a"), [ [ id("field") ] ], {
                    isFieldReference: true,
                    object: {
                        variable: [ "a" ]
                    },
                    name: [ "field" ]
                });
            });
        });
        describe("hash entry", function() {
            var hashEntryShouldContainFields;
            hashEntryShouldContainFields = function(expression, fields) {
                return shouldContainFields(cg.complexExpression(expression).hashEntry(), fields);
            };
            it("if contains one component that is the hash entry", function() {
                return hashEntryShouldContainFields([ [ id("field") ] ], {
                    isHashEntry: true,
                    field: [ "field" ],
                    value: undefined
                });
            });
            return it("if contains more than component then semantic error", function() {
                return hashEntryShouldContainFields([ [ id("field") ], [ id("secondField") ] ], {
                    isSemanticError: true
                });
            });
        });
        describe("definition -> hash entry", function() {
            it("string key", function() {
                var hashEntry;
                hashEntry = cg.complexExpression([ [ string("port") ] ]).definition(cg.variable([ "a" ])).hashEntry();
                return shouldContainFields(hashEntry, {
                    isHashEntry: true,
                    field: {
                        string: "port"
                    },
                    value: {
                        variable: [ "a" ]
                    }
                });
            });
            it("identifier key", function() {
                var hashEntry;
                hashEntry = cg.complexExpression([ [ id("port") ] ]).definition(cg.variable([ "a" ])).hashEntry();
                return shouldContainFields(hashEntry, {
                    isHashEntry: true,
                    field: [ "port" ],
                    value: {
                        variable: [ "a" ]
                    }
                });
            });
            it("field's value can be on a new indented line", function() {
                var hashEntry;
                hashEntry = cg.complexExpression([ [ id("port") ] ]).definition(cg.block([], cg.statements([ cg.variable([ "a" ]) ]))).hashEntry();
                return shouldContainFields(hashEntry, {
                    isHashEntry: true,
                    field: [ "port" ],
                    value: {
                        variable: [ "a" ]
                    }
                });
            });
            return it("can define a method as a hash key", function() {
                var hashEntry;
                hashEntry = cg.complexExpression([ [ id("name"), variable("name") ] ]).definition(cg.variable([ "name" ])).hashEntry(true);
                return shouldContainFields(hashEntry, {
                    isHashEntry: true,
                    field: [ "name" ],
                    value: {
                        isBlock: true,
                        body: {
                            statements: [ {
                                variable: [ "name" ]
                            } ]
                        },
                        parameters: [ {
                            variable: [ "name" ]
                        } ],
                        redefinesSelf: false
                    }
                });
            });
        });
        describe("object operation -> definition", function() {
            var definitionShouldContainFields;
            definitionShouldContainFields = function(object, operation, source, fields) {
                return shouldContainFields(cg.complexExpression(operation).objectOperation(object).definition(source).expression(), fields);
            };
            it("method definition", function() {
                return definitionShouldContainFields(variable("object"), [ [ id("method"), variable("x") ] ], block, {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isFieldReference: true,
                        name: [ "method" ],
                        object: {
                            variable: [ "object" ]
                        }
                    },
                    source: {
                        isBlock: true,
                        parameters: [ {
                            variable: [ "x" ]
                        } ]
                    }
                });
            });
            it("method definition without block", function() {
                return definitionShouldContainFields(variable("object"), [ [ id("method"), variable("x") ] ], variable("y"), {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isFieldReference: true,
                        name: [ "method" ],
                        object: {
                            variable: [ "object" ]
                        }
                    },
                    source: {
                        isBlock: true,
                        redefinesSelf: true,
                        parameters: [ {
                            variable: [ "x" ]
                        } ],
                        body: {
                            statements: [ {
                                variable: [ "y" ]
                            } ]
                        }
                    }
                });
            });
            it("field definition", function() {
                return definitionShouldContainFields(variable("object"), [ [ id("x") ] ], variable("y"), {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isFieldReference: true,
                        name: [ "x" ],
                        object: {
                            variable: [ "object" ]
                        }
                    },
                    source: {
                        isVariable: true,
                        variable: [ "y" ]
                    }
                });
            });
            it("index definition", function() {
                return definitionShouldContainFields(variable("object"), [ [ variable("x") ] ], variable("y"), {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isIndexer: true,
                        indexer: {
                            variable: [ "x" ]
                        },
                        object: {
                            variable: [ "object" ]
                        }
                    },
                    source: {
                        isVariable: true,
                        variable: [ "y" ]
                    }
                });
            });
            it("index method definition", function() {
                return definitionShouldContainFields(variable("object"), [ [ cg.string("xyz"), variable("p") ] ], variable("y"), {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isIndexer: true,
                        indexer: {
                            string: "xyz"
                        },
                        object: {
                            variable: [ "object" ]
                        }
                    },
                    source: {
                        isBlock: true,
                        body: {
                            statements: [ {
                                isVariable: true,
                                variable: [ "y" ]
                            } ]
                        },
                        parameters: [ {
                            variable: [ "p" ]
                        } ]
                    }
                });
            });
            return it("async index method definition with no args", function() {
                return definitionShouldContainFields(variable("object"), [ [ cg.string("xyz"), asyncArgument ] ], variable("y"), {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isIndexer: true,
                        indexer: {
                            string: "xyz"
                        },
                        object: {
                            variable: [ "object" ]
                        }
                    },
                    source: {
                        isBlock: true,
                        body: {
                            statements: [ {
                                isVariable: true,
                                variable: [ "y" ]
                            } ]
                        },
                        parameters: []
                    }
                });
            });
        });
        return describe("definition", function() {
            var definitionShouldContainFields, assignmentShouldContainFields;
            definitionShouldContainFields = function(target, source, fields) {
                return shouldContainFields(cg.complexExpression(target).definition(source).expression(), fields);
            };
            assignmentShouldContainFields = function(target, source, fields) {
                return shouldContainFields(cg.complexExpression(target).definition(source, {
                    assignment: true
                }).expression(), fields);
            };
            it("function definition", function() {
                return definitionShouldContainFields([ [ id("function"), variable("x") ] ], block, {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [ {
                            variable: [ "x" ]
                        } ],
                        body: {
                            statements: [ {
                                variable: [ "x" ]
                            } ]
                        }
                    }
                });
            });
            it("function assignment", function() {
                return assignmentShouldContainFields([ [ id("function"), variable("x") ] ], block, {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [ {
                            variable: [ "x" ]
                        } ],
                        body: {
                            statements: [ {
                                variable: [ "x" ]
                            } ]
                        }
                    }
                });
            });
            it("function definition with optional parameter in tail", function() {
                return definitionShouldContainFields([ [ id("function"), variable("x") ], [ id("port"), int(80) ], [ id("name") ] ], variable("y"), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [ {
                            variable: [ "x" ]
                        } ],
                        optionalParameters: [ {
                            field: [ "port" ],
                            value: {
                                integer: 80
                            }
                        }, {
                            field: [ "name" ],
                            value: undefined
                        } ],
                        body: {
                            statements: [ {
                                variable: [ "y" ]
                            } ]
                        }
                    }
                });
            });
            it("function definition with optional parameter", function() {
                return definitionShouldContainFields([ [ id("function"), variable("x"), cg.hashEntry([ "port" ], int(80)), cg.hashEntry([ "name" ], variable("nil")) ] ], variable("y"), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [ {
                            variable: [ "x" ]
                        } ],
                        optionalParameters: [ {
                            field: [ "port" ],
                            value: {
                                integer: 80
                            }
                        }, {
                            field: [ "name" ],
                            value: {
                                isNil: true
                            }
                        } ],
                        body: {
                            statements: [ {
                                variable: [ "y" ]
                            } ]
                        }
                    }
                });
            });
            it("function definition without block", function() {
                return definitionShouldContainFields([ [ id("function"), variable("x") ] ], variable("y"), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [ {
                            variable: [ "x" ]
                        } ],
                        body: {
                            statements: [ {
                                variable: [ "y" ]
                            } ]
                        }
                    }
                });
            });
            it("async function definition", function() {
                return definitionShouldContainFields([ [ id("function"), asyncArgument ] ], variable("y"), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [],
                        body: {
                            statements: [ {
                                variable: [ "y" ]
                            } ]
                        },
                        isAsync: true
                    }
                });
            });
            it("function definition with empty param list", function() {
                return definitionShouldContainFields([ [ id("function"), cg.argumentList([]) ] ], variable("y"), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [],
                        body: {
                            statements: [ {
                                variable: [ "y" ]
                            } ]
                        }
                    }
                });
            });
            it("variable definition", function() {
                return definitionShouldContainFields([ [ id("function") ] ], variable("y"), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isVariable: true,
                        variable: [ "y" ]
                    }
                });
            });
            it("variable assignment", function() {
                return assignmentShouldContainFields([ [ id("function") ] ], variable("y"), {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        isVariable: true,
                        variable: [ "y" ]
                    }
                });
            });
            it("variable definition with scope", function() {
                return definitionShouldContainFields([ [ id("function") ] ], cg.block([], cg.statements([ variable("y") ])), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "function" ]
                    },
                    source: {
                        variable: [ "y" ]
                    }
                });
            });
            return describe("parameter", function() {
                var parameterShouldContainFields;
                parameterShouldContainFields = function(p, fields) {
                    return shouldContainFields(cg.complexExpression(p).expression().parameter(), fields);
                };
                return it("variable", function() {
                    return parameterShouldContainFields([ [ id("a") ] ], {
                        variable: [ "a" ]
                    });
                });
            });
        });
    });
}).call(this);
});
require("/test/complexExpressionSpec.pogo");

require.define("/test/definitionsSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script, shouldOutput, evaluateScript;
    script = require("./scriptAssertions");
    shouldOutput = script.shouldOutput;
    evaluateScript = script.evaluateScript;
    describe("definitions", function() {
        return describe("definitions cannot shadow other definitions", function() {
            it("throws when an inner scope defines a variable of the same name as defined in outer scope", function() {
                return function() {
                    return evaluateScript("a = 1\n                      \nf () =\n    a = 3");
                }.should.throw(/variable a is already defined/);
            });
            it("can assign to a variable after it has been defined", function() {
                return shouldOutput("a = 1\nprint (a)\n\na := 2\nprint (a)", "1\n2");
            });
            it("can define variable inside if expression", function() {
                return shouldOutput("print (\n    if (true)\n        b = 1\n        b + 1\n)", "2");
            });
            return it("throws when an assignment is made to a variable that hasn't been defined yet", function() {
                return function() {
                    return evaluateScript("a := 1");
                }.should.throw(/variable a is not defined/);
            });
        });
    });
}).call(this);
});
require("/test/definitionsSpec.pogo");

require.define("/test/forSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script;
    script = require("./scriptAssertions");
    describe("for", function() {
        it("can be returned from", function() {
            return script.shouldOutput('count to three () =\n    for (n = 0, n < 10, ++n)\n        if (n > 2)\n            return "three"\n\nprint (count to three ())', "'three'");
        });
        it("returns in functions within for don't return from for", function() {
            return script.shouldOutput("items = [[1, 2, 3], [1, 2], [1]]\n\nfor each @(item) in (items)\n  item count () = return (item.length)\n\n  print (item count ())", "3\n2\n1");
        });
        it("can loop", function() {
            return script.shouldOutput("count to three () =\n    for (n = 0, n < 10, ++n)\n        print (n)\n\ncount to three ()", "0\n1\n2\n3\n4\n5\n6\n7\n8\n9");
        });
        return describe("for in", function() {
            return it("iterates over object's fields", function() {
                return script.shouldOutput("object = {a = 1, b = 2}\n\nfor @(field) in (object)\n    print (field)", "'a'\n'b'");
            });
        });
    });
}).call(this);
});
require("/test/forSpec.pogo");

require.define("/test/functionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script, shouldOutput;
    script = require("./scriptAssertions");
    shouldOutput = script.shouldOutput;
    describe("functions", function() {
        describe("definitions", function() {
            it('functions can be defined by placing the arguments to the left of the equals sign "="', function() {
                return shouldOutput("succ (n) =\n   n + 1\n            \nprint (succ (1))", "2");
            });
            return describe("functions with no arguments", function() {
                it('a function can be defined to have no parameters with empty parens "()"', function() {
                    return shouldOutput('say hi () =\n   print "hi"\n            \nsay hi ()', "'hi'");
                });
                return it("a function's parameters shadow variables in outer scope", function() {
                    return shouldOutput('foo (a) =\n    print (a)\n                \na = "outer a"\nfoo "inner a"\nprint (a)', "'inner a'\n'outer a'");
                });
            });
        });
        describe("splats", function() {
            it("a function can be defined with a single splat parameter", function() {
                return shouldOutput("foo (args, ...) =\n    print (args)\n\nfoo 1 2", "[ 1, 2 ]");
            });
            it("a function can be called with more than one splat argument", function() {
                return shouldOutput("foo (args, ...) =\n    print (args)\n         \nfoo 1 [2, 3] ... [4, 5] ... 6", "[ 1, 2, 3, 4, 5, 6 ]");
            });
            return it("a function's splat parameter shadows variables in outer scope", function() {
                return shouldOutput('foo (a, ...) =\n    print (a.0)\n\na = "outer a"\n\nfoo "inner a"\nprint (a)', "'inner a'\n'outer a'");
            });
        });
        describe("optional arguments", function() {
            it("functions can take optional arguments", function() {
                return shouldOutput("print (size: 10)", "{ size: 10 }");
            });
            it("a function can be defined to take an optional argument", function() {
                return shouldOutput('open tcp connection (host: nil, port: nil) =\n    print (host)\n    print (port)\n\nopen tcp connection (host: "pogoscript.org", port: 80)', "'pogoscript.org'\n80");
            });
            it("if the optional parameter has a default value\nand no optional arguments are passed by the caller,\nthen that default value is used", function() {
                return shouldOutput("open tcp connection (port: 80) =\n    print (port)\n\nopen tcp connection ()", "80");
            });
            it("if the optional parameter has a default value\nand other optional arguments are passed by the caller\nbut not that one, then that default value is used", function() {
                return shouldOutput('open tcp connection (port: 80) =\n    print (port)\n\nopen tcp connection (host: "pogoscript.org")', "80");
            });
            it("a function's optional parameter shadows variables in outer scope", function() {
                return shouldOutput('foo (bar: nil) =\n    print (bar)\n\nbar = "outer bar"\nfoo (bar: "inner bar")\nprint (bar)', "'inner bar'\n'outer bar'");
            });
            it("a function's optional parameter shadows variables in outer scope,\neven if it has a default value", function() {
                return shouldOutput('foo (bar: 80) =\n    print (bar)\n\nbar = "outer bar"\nfoo (bar: "inner bar")\nprint (bar)', "'inner bar'\n'outer bar'");
            });
            return it("when a block is passed as an optional argument, it does not redefine self", function() {
                return shouldOutput('foo (bar: nil) =\n    bar ()\n\nobj = {\n    field = "field value"\n    method () =\n        foo (bar (): print (self.field))\n}\n\nobj.method ()', "'field value'");
            });
        });
        return describe("redefining self", function() {
            return it("redefines self with the => operator", function() {
                return shouldOutput('print self () = =>\n    print (self.x)\n\nprint self.call ({x = "self"})', "'self'");
            });
        });
    });
}).call(this);
});
require("/test/functionSpec.pogo");

require.define("/test/hashSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script, assert, shouldOutput, shouldThrow;
    script = require("./scriptAssertions");
    assert = require("assert");
    shouldOutput = script.shouldOutput;
    shouldThrow = script.shouldThrow;
    describe("hashes", function() {
        return describe("evaluation", function() {
            it("a `true` hash entry does not need it's value specified", function() {
                return shouldOutput("print {one}", "{ one: true }");
            });
            it("a hash can have multiple entries, delimited by commas", function() {
                return shouldOutput("print {color 'red', size 'large'}", "{ color: 'red', size: 'large' }");
            });
            it("a hash can have multiple entries, delimited by new lines", function() {
                return shouldOutput("print {\n    color 'red'\n    size 'large'\n}", "{ color: 'red', size: 'large' }");
            });
            return it('hash entries can be written with an equals "=" operator', function() {
                return shouldOutput("print {color = 'red', size = 'large'}", "{ color: 'red', size: 'large' }");
            });
        });
    });
}).call(this);
});
require("/test/hashSpec.pogo");

require.define("/test/ifSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script, shouldOutput;
    script = require("./scriptAssertions");
    shouldOutput = script.shouldOutput;
    describe("if", function() {
        return describe("evaluation", function() {
            return it("a `true` hash entry does not need it's value specified", function() {
                return shouldOutput('print (\n    if (true)\n        "true"\n    else\n        "false"\n)', "'true'");
            });
        });
    });
}).call(this);
});
require("/test/ifSpec.pogo");

require.define("/test/interpolationSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var interpolation, shouldBeFalse, shouldBeTrue;
    interpolation = require("../lib/parser/interpolation");
    shouldBeFalse = function(x) {
        return x.should.not.be.ok;
    };
    shouldBeTrue = function(x) {
        return x.should.be.ok;
    };
    describe("interpolation", function() {
        var interpolationState;
        interpolationState = undefined;
        beforeEach(function() {
            return interpolationState = interpolation.createInterpolation();
        });
        describe("the number of starts should be matched by the same number of stops", function() {
            it("should not be interpolating if it interpolation hasn't been started", function() {
                return shouldBeFalse(interpolationState.interpolating());
            });
            it("should be interpolating if it interpolation has been started", function() {
                interpolationState.startInterpolation();
                return shouldBeTrue(interpolationState.interpolating());
            });
            it("should not be interpolating if interpolation has been started, then stopped", function() {
                interpolationState.startInterpolation();
                interpolationState.stopInterpolation();
                return shouldBeFalse(interpolationState.interpolating());
            });
            it("should not be interpolating if started twice and stopped twice", function() {
                interpolationState.startInterpolation();
                interpolationState.startInterpolation();
                interpolationState.stopInterpolation();
                interpolationState.stopInterpolation();
                return shouldBeFalse(interpolationState.interpolating());
            });
            return it("should be interpolating if started twice and stopped once", function() {
                interpolationState.startInterpolation();
                interpolationState.startInterpolation();
                interpolationState.stopInterpolation();
                return shouldBeTrue(interpolationState.interpolating());
            });
        });
        describe("when there are more close brackets than open brackets, then interpolation is finished", function() {
            beforeEach(function() {
                return interpolationState.startInterpolation();
            });
            it("should be finished interpolation after a close bracket", function() {
                interpolationState.closeBracket();
                return shouldBeTrue(interpolationState.finishedInterpolation());
            });
            it("should not be finished interpolation after an open, then close bracket", function() {
                interpolationState.openBracket();
                interpolationState.closeBracket();
                return shouldBeFalse(interpolationState.finishedInterpolation());
            });
            it("should not be finished interpolation after a two opens, and two close brackets", function() {
                interpolationState.openBracket();
                interpolationState.openBracket();
                interpolationState.closeBracket();
                interpolationState.closeBracket();
                return shouldBeFalse(interpolationState.finishedInterpolation());
            });
            return it("should be finished interpolation after a two opens, and three close brackets", function() {
                interpolationState.openBracket();
                interpolationState.openBracket();
                interpolationState.closeBracket();
                interpolationState.closeBracket();
                interpolationState.closeBracket();
                return shouldBeTrue(interpolationState.finishedInterpolation());
            });
        });
        return describe('multiple interpolations.\ngiven the following scenario:\n\n"foo #(func ("bar #(x)"))"\n    \nstart interpolation, open bracket\nstart inner interpolation\nclose bracket, stop interpolation\nclose bracket, close bracket\nstop interpolation', function() {
            return it("should have stopped interpolation", function() {
                interpolationState.startInterpolation();
                interpolationState.openBracket();
                interpolationState.startInterpolation();
                interpolationState.closeBracket();
                shouldBeTrue(interpolationState.finishedInterpolation());
                interpolationState.stopInterpolation();
                shouldBeTrue(interpolationState.interpolating());
                interpolationState.closeBracket();
                interpolationState.closeBracket();
                shouldBeTrue(interpolationState.finishedInterpolation());
                interpolationState.stopInterpolation();
                return shouldBeFalse(interpolationState.interpolating());
            });
        });
    });
}).call(this);
});
require("/test/interpolationSpec.pogo");

require.define("/test/macroDirectorySpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var cg, assert;
    cg = require("../lib/parser/codeGenerator").codeGenerator();
    require("./assertions");
    assert = require("assert");
    describe("macro directory", function() {
        it("one macro", function() {
            var md;
            md = cg.macroDirectory();
            md.addMacro([ "one" ], 1);
            return assert.equal(md.findMacro([ "one" ]), 1);
        });
        it("longer name doesn't find macro with shorter name", function() {
            var md;
            md = cg.macroDirectory();
            md.addMacro([ "one" ], 1);
            return assert.equal(md.findMacro([ "one", "two" ]), void 0);
        });
        it("finds correct macro among two", function() {
            var md;
            md = cg.macroDirectory();
            md.addMacro([ "one" ], 1);
            md.addMacro([ "one", "two" ], 2);
            return assert.equal(md.findMacro([ "one", "two" ]), 2);
        });
        it("adding same macro overwrites previous", function() {
            var md;
            md = cg.macroDirectory();
            md.addMacro([ "one", "two" ], 2);
            md.addMacro([ "one", "two" ], 3);
            return assert.equal(md.findMacro([ "one", "two" ]), 3);
        });
        return describe("wild card macros", function() {
            it("wild card macro with further name requirement", function() {
                var md, macro, wild;
                md = cg.macroDirectory();
                macro = {};
                wild = function(name) {
                    if (name.length === 3 && name[2] === "three") {
                        return macro;
                    }
                };
                md.addWildCardMacro([ "one", "two" ], wild);
                assert.equal(md.findMacro([ "one", "two" ]), void 0);
                assert.equal(md.findMacro([ "one", "two", "three" ]), macro);
                return assert.equal(md.findMacro([ "one", "two", "four" ]), void 0);
            });
            it("wild card macro with exact name", function() {
                var md, macro, wild;
                md = cg.macroDirectory();
                macro = {};
                wild = function(name) {
                    return macro;
                };
                md.addWildCardMacro([ "one", "two" ], wild);
                return assert.equal(md.findMacro([ "one", "two" ]), macro);
            });
            return it("normal macros have priority over wild card macros", function() {
                var md, macro, wild;
                md = cg.macroDirectory();
                macro = {};
                wild = function(name) {
                    if (name.length === 3 && name[2] === "three") {
                        return macro;
                    }
                };
                md.addWildCardMacro([ "one", "two" ], wild);
                md.addMacro([ "one", "two", "three" ], 3);
                assert.equal(md.findMacro([ "one", "two" ]), void 0);
                assert.equal(md.findMacro([ "one", "two", "three" ]), 3);
                return assert.equal(md.findMacro([ "one", "two", "four" ]), void 0);
            });
        });
    });
}).call(this);
});
require("/test/macroDirectorySpec.pogo");

require.define("/test/macrosSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, loc;
    require("./assertions");
    require("./parserAssertions");
    terms = require("../lib/parser/codeGenerator").codeGenerator();
    loc = {
        firstLine: 1,
        lastLine: 1,
        firstColumn: 3,
        lastColumn: 8
    };
    describe("macros", function() {
        describe("if", function() {
            it("if", function() {
                return shouldContainFields(macroExpression("if (true) @{a}"), {
                    isIfExpression: true,
                    cases: [ {
                        condition: {
                            variable: [ "true" ]
                        },
                        body: {
                            statements: [ {
                                variable: [ "a" ]
                            } ]
                        }
                    } ]
                });
            });
            it("if else", function() {
                return shouldContainFields(macroExpression("if (true) @{a} else @{b}"), {
                    isIfExpression: true,
                    elseBody: {
                        statements: [ {
                            variable: [ "b" ]
                        } ]
                    },
                    cases: [ {
                        condition: {
                            variable: [ "true" ]
                        },
                        body: {
                            statements: [ {
                                variable: [ "a" ]
                            } ]
                        }
                    } ]
                });
            });
            it("if else if", function() {
                return shouldContainFields(macroExpression("if (true) @{a} else if (false) @{b}"), {
                    isIfExpression: true,
                    elseBody: undefined,
                    cases: [ {
                        condition: {
                            variable: [ "true" ]
                        },
                        body: {
                            statements: [ {
                                variable: [ "a" ]
                            } ]
                        }
                    }, {
                        condition: {
                            variable: [ "false" ]
                        },
                        body: {
                            statements: [ {
                                variable: [ "b" ]
                            } ]
                        }
                    } ]
                });
            });
            return it("if else if else", function() {
                return shouldContainFields(macroExpression("if (true) @{a} else if (false) @{b} else @{c}"), {
                    isIfExpression: true,
                    elseBody: {
                        statements: [ {
                            variable: [ "c" ]
                        } ]
                    },
                    cases: [ {
                        condition: {
                            variable: [ "true" ]
                        },
                        body: {
                            statements: [ {
                                variable: [ "a" ]
                            } ]
                        }
                    }, {
                        condition: {
                            variable: [ "false" ]
                        },
                        body: {
                            statements: [ {
                                variable: [ "b" ]
                            } ]
                        }
                    } ]
                });
            });
        });
        it("for", function() {
            return shouldContainFields(macroExpression("for (n = 0, n < 10, n = n + 1) @{a}"), {
                isFor: true,
                initialization: {
                    isDefinition: true,
                    source: {
                        integer: 0
                    },
                    target: {
                        variable: [ "n" ]
                    }
                },
                test: {
                    isOperator: true,
                    operator: "<",
                    operatorArguments: [ {
                        variable: [ "n" ]
                    }, {
                        integer: 10
                    } ]
                },
                increment: {
                    isDefinition: true,
                    target: {
                        variable: [ "n" ]
                    },
                    source: {
                        isOperator: true,
                        operator: "+",
                        operatorArguments: [ {
                            variable: [ "n" ]
                        }, {
                            integer: 1
                        } ]
                    }
                },
                statements: {
                    isStatements: true,
                    statements: [ {
                        variable: [ "a" ]
                    } ]
                }
            });
        });
        it("for with return in body", function() {
            return shouldContainFields(macroExpression("for (n = 0, n < 10, n = n + 1) @{return (a)}"), {
                isFor: true,
                initialization: {
                    isDefinition: true,
                    source: {
                        integer: 0
                    },
                    target: {
                        variable: [ "n" ]
                    }
                },
                test: {
                    isOperator: true,
                    operator: "<",
                    operatorArguments: [ {
                        variable: [ "n" ]
                    }, {
                        integer: 10
                    } ]
                },
                increment: {
                    isDefinition: true,
                    target: {
                        variable: [ "n" ]
                    },
                    source: {
                        isOperator: true,
                        operator: "+",
                        operatorArguments: [ {
                            variable: [ "n" ]
                        }, {
                            integer: 1
                        } ]
                    }
                },
                statements: {
                    isStatements: true,
                    statements: [ {
                        isDefinition: true,
                        source: {},
                        target: {
                            isVariable: true,
                            name: [ "for", "result" ]
                        }
                    }, {
                        isIfExpression: true,
                        cases: [ {
                            condition: {
                                isSubExpression: true,
                                expression: {
                                    isFunctionCall: true,
                                    "function": {
                                        isClosure: true,
                                        parameters: [ {
                                            variable: [ "n" ]
                                        } ],
                                        body: {
                                            isStatements: true,
                                            statements: [ {
                                                isDefinition: true,
                                                target: {
                                                    isVariable: true,
                                                    name: [ "for", "result" ]
                                                },
                                                source: {
                                                    variable: [ "a" ]
                                                }
                                            }, {
                                                isReturn: true,
                                                expression: {
                                                    "boolean": true
                                                }
                                            } ]
                                        }
                                    },
                                    functionArguments: [ {
                                        variable: [ "n" ]
                                    } ]
                                }
                            },
                            body: {
                                isStatements: true,
                                statements: [ {
                                    isReturn: true,
                                    expression: {
                                        isVariable: true,
                                        name: [ "for", "result" ]
                                    }
                                } ]
                            }
                        } ]
                    } ]
                }
            });
        });
        describe("for each", function() {
            return it("generates for", function() {
                return shouldContainFields(macroStatements("for each @(item) in (items) @{item}"), {
                    statements: [ terms.definition(terms.generatedVariable([ "items" ]), terms.variable([ "items" ])), terms.forExpression(terms.definition(terms.generatedVariable([ "i" ]), terms.integer(0)), terms.operator("<", [ terms.generatedVariable([ "i" ]), terms.fieldReference(terms.generatedVariable([ "items" ]), [ "length" ]) ]), terms.increment(terms.generatedVariable([ "i" ])), terms.statements([ terms.definition(terms.variable([ "item" ]), terms.indexer(terms.generatedVariable([ "items" ]), terms.generatedVariable([ "i" ]))), terms.variable([ "item" ]) ])) ]
                });
            });
        });
        describe("for @(item) in (items) @{}", function() {
            return it("generates for (var item in items) {}", function() {
                return shouldContainFields(macroExpression("for @(item) in (items) @{item}"), {
                    isForIn: true,
                    iterator: {
                        isDefinition: true,
                        target: {
                            variable: [ "item" ]
                        }
                    },
                    collection: {
                        variable: [ "items" ]
                    },
                    statements: {
                        isSubExpression: true,
                        expression: {
                            isFunctionCall: true,
                            "function": {
                                isClosure: true,
                                parameters: [ {
                                    variable: [ "item" ]
                                } ],
                                body: {
                                    isStatements: true,
                                    statements: [ {
                                        variable: [ "item" ]
                                    } ]
                                }
                            },
                            functionArguments: [ {
                                variable: [ "item" ]
                            } ]
                        }
                    }
                });
            });
        });
        it("while", function() {
            return shouldContainFields(macroExpression("while (n < 10) @{n}"), {
                isWhile: true,
                condition: {
                    isOperator: true,
                    operator: "<",
                    operatorArguments: [ {
                        variable: [ "n" ]
                    }, {
                        integer: 10
                    } ]
                },
                statements: {
                    statements: [ {
                        variable: [ "n" ]
                    } ]
                }
            });
        });
        describe("try", function() {
            it("try catch", function() {
                return shouldContainFields(macroExpression("try @{a} catch (ex) @{b}"), {
                    isTryExpression: true,
                    body: {
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    },
                    catchBody: {
                        statements: [ {
                            variable: [ "b" ]
                        } ]
                    },
                    catchParameter: {
                        variable: [ "ex" ]
                    },
                    finallyBody: void 0
                });
            });
            it("try finally", function() {
                return shouldContainFields(macroExpression("try @{a} finally @{b}"), {
                    isTryExpression: true,
                    body: {
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    },
                    catchBody: undefined,
                    finallyBody: {
                        statements: [ {
                            variable: [ "b" ]
                        } ]
                    }
                });
            });
            return it("try catch finally", function() {
                return shouldContainFields(macroExpression("try @{a} catch (ex) @{b} finally @{c}"), {
                    isTryExpression: true,
                    body: {
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    },
                    catchBody: {
                        statements: [ {
                            variable: [ "b" ]
                        } ]
                    },
                    catchParameter: {
                        variable: [ "ex" ]
                    },
                    finallyBody: {
                        statements: [ {
                            variable: [ "c" ]
                        } ]
                    }
                });
            });
        });
        describe("new", function() {
            it("constructor with arguments", function() {
                return shouldContainFields(macroExpression("new (Date 2011 2 21)"), {
                    isNewOperator: true,
                    functionCall: {
                        isFunctionCall: true,
                        "function": {
                            variable: [ "Date" ]
                        },
                        functionArguments: [ {
                            integer: 2011
                        }, {
                            integer: 2
                        }, {
                            integer: 21
                        } ]
                    }
                });
            });
            it("constructor without arguments, just variable", function() {
                return shouldContainFields(macroExpression("new (Date)"), {
                    isNewOperator: true,
                    functionCall: {
                        variable: [ "Date" ]
                    }
                });
            });
            return it("with splat arguments", function() {
                return shouldContainFields(macroStatements("new (Stack (args, ...))"), terms.statements([ terms.definition(terms.generatedVariable([ "c" ]), terms.closure([], terms.statements([ terms.functionCall(terms.variable([ "Stack" ]), [ terms.variable([ "args" ]), terms.splat() ], {
                    passThisToApply: true
                }) ]), {
                    returnLastStatement: false
                })), terms.definition(terms.fieldReference(terms.generatedVariable([ "c" ]), [ "prototype" ]), terms.fieldReference(terms.variable([ "Stack" ]), [ "prototype" ])), terms.newOperator(terms.generatedVariable([ "c" ])) ]));
            });
        });
        describe("==", function() {
            return it("generates ===", function() {
                return shouldContainFields(macroExpression("a == b"), {
                    isOperator: true,
                    operator: "===",
                    operatorArguments: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
        });
        describe("!=", function() {
            return it("generates !==", function() {
                return shouldContainFields(macroExpression("a != b"), {
                    isOperator: true,
                    operator: "!==",
                    operatorArguments: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
        });
        describe("::", function() {
            return it("generates instanceof", function() {
                return shouldContainFields(macroExpression("a :: b"), {
                    isOperator: true,
                    operator: "instanceof",
                    operatorArguments: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
        });
        describe("in", function() {
            return it("generates in", function() {
                return shouldContainFields(macroExpression("(a) in (b)"), {
                    isOperator: true,
                    operator: "in",
                    operatorArguments: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
        });
        describe("break", function() {
            return it("generates break statement", function() {
                return shouldContainFields(macroExpression("break"), {
                    isBreak: true
                });
            });
        });
        describe("return", function() {
            return it("generates void return statement", function() {
                return shouldContainFields(macroExpression("return"), {
                    isReturn: true,
                    expression: undefined
                });
            });
        });
        describe("nil", function() {
            return it("generates void 0", function() {
                return shouldContainFields(macroExpression("nil"), {
                    isNil: true
                });
            });
        });
        describe("continuation", function() {
            context("when called as a function", function() {
                return shouldContainFields(macroExpression("continuation (x, y)"), {
                    isFunctionCall: true,
                    "function": {
                        isContinuation: true
                    },
                    functionArguments: [ {
                        variable: [ "x" ]
                    }, {
                        variable: [ "y" ]
                    } ]
                });
            });
            return context("when as a variable", function() {
                return shouldContainFields(macroExpression("continuation"), {
                    isContinuation: true
                });
            });
        });
        return describe("JavaScript operators", function() {
            var itGeneratesUnary, itGeneratesBinary;
            itGeneratesUnary = function(op) {
                return it("generates unary " + op, function() {
                    return shouldContainFields(macroExpression(op + " a"), {
                        isOperator: true,
                        operator: op,
                        operatorArguments: [ {
                            variable: [ "a" ]
                        } ]
                    });
                });
            };
            itGeneratesBinary = function(op) {
                return it("generates binary " + op, function() {
                    return shouldContainFields(macroExpression("a " + op + " b"), {
                        isOperator: true,
                        operator: op,
                        operatorArguments: [ {
                            variable: [ "a" ]
                        }, {
                            variable: [ "b" ]
                        } ]
                    });
                });
            };
            itGeneratesUnary("!");
            itGeneratesUnary("~");
            itGeneratesUnary("+");
            itGeneratesUnary("-");
            itGeneratesUnary("--");
            itGeneratesUnary("++");
            itGeneratesBinary("+");
            itGeneratesBinary("*");
            itGeneratesBinary("/");
            itGeneratesBinary("-");
            itGeneratesBinary("%");
            itGeneratesBinary("<<");
            itGeneratesBinary(">>");
            itGeneratesBinary(">>>");
            itGeneratesBinary(">");
            itGeneratesBinary(">=");
            itGeneratesBinary("<");
            itGeneratesBinary("<=");
            itGeneratesBinary("&");
            itGeneratesBinary("^");
            itGeneratesBinary("|");
            itGeneratesBinary("&&");
            return itGeneratesBinary("||");
        });
    });
}).call(this);
});
require("/test/macrosSpec.pogo");

require.define("/test/methodSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script, shouldOutput;
    script = require("./scriptAssertions");
    shouldOutput = script.shouldOutput;
    describe("methods", function() {
        return describe("preserving self", function() {
            return context("when a block is called within a method", function() {
                return it("uses the same self as the method", function() {
                    return shouldOutput('block (b) = b ()\n\no = {\n    name = "name"\n\n    my method () =\n        block\n            print (self.name)\n}\n\no.my method ()', "'name'");
                });
            });
        });
    });
}).call(this);
});
require("/test/methodSpec.pogo");

require.define("/test/moduleConstantsSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../lib/parser/codeGenerator").codeGenerator();
    require("./assertions");
    describe("module constants", function() {
        it("ignores the second definition of a constant", function() {
            var module, piVariable;
            module = terms.module(terms.statements([ terms.variable([ "a" ]) ]), {
                inScope: false
            });
            piVariable = terms.moduleConstants.defineAs([ "pi" ], terms.float(3.142));
            terms.moduleConstants.defineAs([ "pi" ], terms.float(3));
            return shouldContainFields(terms.moduleConstants.definitions(), [ terms.definition(piVariable, terms.float(3.142)) ]);
        });
        return it("all definitions of the same constant return the same variable", function() {
            var firstPi, secondPi;
            firstPi = terms.moduleConstants.defineAs([ "pi" ], terms.float(3.142));
            secondPi = terms.moduleConstants.defineAs([ "pi" ], terms.float(3));
            return firstPi.should.equal(secondPi);
        });
    });
}).call(this);
});
require("/test/moduleConstantsSpec.pogo");

require.define("/test/newSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script;
    script = require("./scriptAssertions");
    describe("new", function() {
        it("can construct with arguments", function() {
            return script.shouldOutput("c (n) = =>\n    this.n = n\n    nil\n\nprint (new (c 7))", "{ n: 7 }");
        });
        it("can construct without arguments", function() {
            return script.shouldOutput('c () = =>\n    this.n = "n"\n    nil\n\nprint (new (c))', "{ n: 'n' }");
        });
        it("can construct without arguments and get field reference", function() {
            return script.shouldOutput('c () = =>\n    this.n = "n"\n    nil\n\nprint ((new (c)).n)', "'n'");
        });
        return it("can construct with splat arguments", function() {
            return script.shouldOutput("c (n) = =>\n    this.n = n\n    nil\n\nargs = [7]\n\nprint (new (c (args, ...)))", "{ n: 7 }");
        });
    });
}).call(this);
});
require("/test/newSpec.pogo");

require.define("/test/operatorExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var cg, expression, complexExpression, variable, loc, id;
    cg = require("../lib/parser/codeGenerator").codeGenerator();
    require("./assertions");
    expression = function(expression) {
        return cg.operatorExpression(complexExpression(expression));
    };
    complexExpression = function(expression) {
        return cg.complexExpression([ expression ]);
    };
    variable = function(name) {
        return cg.variable([ name ]);
    };
    loc = {
        firstLine: 1,
        lastLine: 1,
        firstColumn: 3,
        lastColumn: 8
    };
    id = function(name) {
        return cg.loc(cg.identifier(name), loc);
    };
    describe("operator expression", function() {
        it("a", function() {
            var e;
            e = expression([ id("a") ]);
            return shouldContainFields(e.expression(), {
                isVariable: true,
                variable: [ "a" ]
            });
        });
        it("looks up macro", function() {
            var e;
            e = expression([ id("a") ]);
            e.addOperatorExpression("+", complexExpression([ id("b") ]));
            return shouldContainFields(e.expression(), {
                operator: "+",
                operatorArguments: [ {
                    variable: [ "a" ]
                }, {
                    variable: [ "b" ]
                } ]
            });
        });
        describe("hash entry", function() {
            it("a", function() {
                var e;
                e = expression([ id("a") ]);
                return shouldContainFields(e.hashEntry(), {
                    isHashEntry: true,
                    field: [ "a" ],
                    value: undefined
                });
            });
            return it("a */ b", function() {
                var e;
                e = expression([ id("a") ]);
                e.addOperatorExpression("*/", complexExpression([ id("b") ]));
                return shouldContainFields(e.hashEntry(), {
                    isSemanticError: true
                });
            });
        });
        return describe("definition", function() {
            it("a = b", function() {
                var e;
                e = expression([ id("a") ]);
                return shouldContainFields(e.definition(variable("b")).expression(), {
                    isDefinition: true,
                    target: {
                        variable: [ "a" ]
                    },
                    source: {
                        variable: [ "b" ]
                    }
                });
            });
            return it("a */ b = c", function() {
                var e;
                e = expression([ id("a") ]);
                e.addOperatorExpression("*/", complexExpression([ id("b") ]));
                return shouldContainFields(e.definition(variable("c")), {
                    isDefinition: true,
                    target: {
                        isFieldReference: true,
                        object: {
                            variable: [ "a" ]
                        },
                        name: [ "*/" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [ {
                            variable: [ "b" ]
                        } ],
                        optionalParameters: [],
                        body: {
                            statements: [ {
                                variable: [ "c" ]
                            } ]
                        }
                    }
                });
            });
        });
    });
}).call(this);
});
require("/test/operatorExpressionSpec.pogo");

require.define("/test/parserContextSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var parserContext, cg, shouldContainFields;
    parserContext = require("../lib/parser/parserContext");
    cg = require("../lib/parser/codeGenerator").codeGenerator();
    shouldContainFields = require("./containsFields").containsFields;
    describe("parser context", function() {
        var context;
        context = parserContext.createParserContext({
            terms: cg
        });
        describe("compress interpolated string components", function() {
            it("joins contiguous string components together", function() {
                var components;
                components = context.compressInterpolatedStringComponents([ cg.string("one"), cg.string("two") ]);
                return shouldContainFields(components, [ {
                    isString: true,
                    string: "onetwo"
                } ]);
            });
            return it("joins two groups of contiguous string components together, separated by an expression", function() {
                var components;
                components = context.compressInterpolatedStringComponents([ cg.string("one"), cg.string("two"), cg.variable([ "value" ]), cg.string("three"), cg.string("four") ]);
                return shouldContainFields(components, [ {
                    isString: true,
                    string: "onetwo"
                }, {
                    variable: [ "value" ]
                }, {
                    isString: true,
                    string: "threefour"
                } ]);
            });
        });
        describe("unindent string components", function() {
            return it("removes indentation from each string component", function() {
                var components;
                components = context.unindentStringComponentsBy([ cg.string("one"), cg.string("\n      two"), cg.string("\n        three") ], 6);
                return shouldContainFields(components, [ {
                    isString: true,
                    string: "one"
                }, {
                    isString: true,
                    string: "\ntwo"
                }, {
                    isString: true,
                    string: "\n  three"
                } ]);
            });
        });
        return describe("separate expression components with strings", function() {
            return it("puts string components between contiguous expression components", function() {
                var components;
                components = context.separateExpressionComponentsWithStrings([ cg.variable([ "one" ]), cg.variable([ "two" ]) ]);
                return shouldContainFields(components, [ {
                    variable: [ "one" ]
                }, {
                    isString: true,
                    string: ""
                }, {
                    variable: [ "two" ]
                } ]);
            });
        });
    });
}).call(this);
});
require("/test/parserContextSpec.pogo");

require.define("/test/parserSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var parser, createTerms;
    require("./assertions");
    parser = require("../lib/parser/parser");
    require("./parserAssertions");
    createTerms = function() {
        return require("../lib/parser/codeGenerator").codeGenerator();
    };
    describe("parser", function() {
        var terms;
        terms = void 0;
        before(function() {
            return terms = createTerms();
        });
        describe("terminals", function() {
            describe("integers", function() {
                it("can parse 5", function() {
                    return shouldContainFields(expression("5"), {
                        integer: 5
                    });
                });
                return it("can parse 09", function() {
                    return shouldContainFields(expression("09"), {
                        integer: 9
                    });
                });
            });
            it("float", function() {
                return shouldContainFields(expression("5.6"), {
                    "float": 5.6
                });
            });
            describe("variables", function() {
                it("simple", function() {
                    return shouldContainFields(expression("total weight"), {
                        variable: [ "total", "weight" ]
                    });
                });
                return it("can use $ as a variable", function() {
                    return shouldContainFields(expression("$"), {
                        variable: [ "$" ]
                    });
                });
            });
            describe("strings", function() {
                it("simple string", function() {
                    return shouldContainFields(expression("'a string'"), {
                        isString: true,
                        string: "a string"
                    });
                });
                it("string with single quotes", function() {
                    return shouldContainFields(expression("'''alright!'' he said'"), {
                        isString: true,
                        string: "'alright!' he said"
                    });
                });
                it("string with backslash", function() {
                    return shouldContainFields(expression("'one \\ two'"), {
                        isString: true,
                        string: "one \\ two"
                    });
                });
                it("multiline string", function() {
                    return shouldContainFields(expression("  'one\n   two'"), {
                        isString: true,
                        string: "one\ntwo"
                    });
                });
                it("multiline string with empty lines", function() {
                    return shouldContainFields(expression("  'one\n\n   two\n\n   three'"), {
                        isString: true,
                        string: "one\n\ntwo\n\nthree"
                    });
                });
                it("multiline double-quote string", function() {
                    return shouldContainFields(expression('  "one\n   two"'), {
                        isString: true,
                        string: "one\ntwo"
                    });
                });
                return it("two multiline string in function", function() {
                    return shouldContainFields(expression("x 'one\n   two' y \"three\n           four\""), {
                        isFunctionCall: true,
                        "function": {
                            variable: [ "x", "y" ]
                        },
                        functionArguments: [ {
                            string: "one\ntwo"
                        }, {
                            string: "three\nfour"
                        } ]
                    });
                });
            });
            describe("interpolated strings", function() {
                it("simple", function() {
                    return shouldContainFields(expression('"a string"'), {
                        isString: true,
                        string: "a string"
                    });
                });
                it("empty", function() {
                    return shouldContainFields(expression('""'), {
                        isString: true,
                        string: ""
                    });
                });
                it("with newline", function() {
                    return shouldContainFields(expression('"one\\ntwo"'), {
                        string: "one\ntwo"
                    });
                });
                it("with newline escape and indentation should not remove indentation", function() {
                    return shouldContainFields(expression('  "one\\n    two"'), {
                        string: "one\n    two"
                    });
                });
                it("with indentation", function() {
                    return shouldContainFields(expression('  "one\n   two"'), {
                        string: "one\ntwo"
                    });
                });
                it("with single variable expression", function() {
                    return shouldContainFields(expression('"a boat #(boat length) meters in length"'), {
                        isInterpolatedString: true,
                        components: [ {
                            string: "a boat "
                        }, {
                            variable: [ "boat", "length" ]
                        }, {
                            string: " meters in length"
                        } ]
                    });
                });
                it("with hash # character at end", function() {
                    return shouldContainFields(expression('"this is a hash: #"'), {
                        isString: true,
                        string: "this is a hash: #"
                    });
                });
                it("with hash # character in middle", function() {
                    return shouldContainFields(expression('"this is a hash: #, ok?"'), {
                        isString: true,
                        string: "this is a hash: #, ok?"
                    });
                });
                it("with escaped #", function() {
                    return shouldContainFields(expression('"a boat \\#(boat length) meters in length"'), {
                        isString: true,
                        string: "a boat #(boat length) meters in length"
                    });
                });
                it("with complex expression", function() {
                    return shouldContainFields(expression('"a boat #(lookup boat length from (boat database)) meters in length"'), {
                        isInterpolatedString: true,
                        components: [ {
                            string: "a boat "
                        }, {
                            "function": {
                                variable: [ "lookup", "boat", "length", "from" ]
                            },
                            functionArguments: [ {
                                variable: [ "boat", "database" ]
                            } ]
                        }, {
                            string: " meters in length"
                        } ]
                    });
                });
                it("in block", function() {
                    return shouldContainFields(expression('abc =\n    "#(stuff)"'), {
                        isDefinition: true,
                        target: {
                            isVariable: true,
                            variable: [ "abc" ]
                        },
                        source: {
                            isVariable: true,
                            variable: [ "stuff" ]
                        }
                    });
                });
                return it("with inner interpolation", function() {
                    return shouldContainFields(expression('"a boat #("#(boat length) meters") in length"'), {
                        isInterpolatedString: true,
                        components: [ {
                            string: "a boat "
                        }, {
                            isInterpolatedString: true,
                            components: [ {
                                variable: [ "boat", "length" ]
                            }, {
                                string: " meters"
                            } ]
                        }, {
                            string: " in length"
                        } ]
                    });
                });
            });
            describe("sub expressions", function() {
                return it("single expression", function() {
                    return shouldContainFields(expression("(x)"), {
                        variable: [ "x" ]
                    });
                });
            });
            describe("lists", function() {
                it("empty", function() {
                    return shouldContainFields(expression("[]"), {
                        isList: true,
                        items: []
                    });
                });
                it("one item", function() {
                    return shouldContainFields(expression("[1]"), {
                        isList: true,
                        items: [ {
                            integer: 1
                        } ]
                    });
                });
                it("two items", function() {
                    return shouldContainFields(expression("[1, 2]"), {
                        isList: true,
                        items: [ {
                            integer: 1
                        }, {
                            integer: 2
                        } ]
                    });
                });
                return it("two items separated by newlines", function() {
                    return shouldContainFields(expression("[\n  1\n  2\n]"), {
                        isList: true,
                        items: [ {
                            integer: 1
                        }, {
                            integer: 2
                        } ]
                    });
                });
            });
            return describe("hashes", function() {
                it("empty hash", function() {
                    return shouldContainFields(expression("{}"), {
                        isHash: true,
                        entries: []
                    });
                });
                it("hash with one entry", function() {
                    return shouldContainFields(expression("{port 1234}"), {
                        isHash: true,
                        entries: [ {
                            field: [ "port" ],
                            value: {
                                integer: 1234
                            }
                        } ]
                    });
                });
                it("hash with two entries", function() {
                    return shouldContainFields(expression("{port 1234, ip address '1.1.1.1'}"), {
                        isHash: true,
                        entries: [ {
                            field: [ "port" ],
                            value: {
                                integer: 1234
                            }
                        }, {
                            field: [ "ip", "address" ],
                            value: {
                                string: "1.1.1.1"
                            }
                        } ]
                    });
                });
                it("hash with two entries on different lines", function() {
                    return shouldContainFields(expression("{port = 1234\nip address = '1.1.1.1'}"), {
                        isHash: true,
                        entries: [ {
                            field: [ "port" ],
                            value: {
                                integer: 1234
                            }
                        }, {
                            field: [ "ip", "address" ],
                            value: {
                                string: "1.1.1.1"
                            }
                        } ]
                    });
                });
                it("hash with string with assignment", function() {
                    return shouldContainFields(expression("{'port' = 1234}"), {
                        isHash: true,
                        entries: [ {
                            field: {
                                string: "port"
                            },
                            value: {
                                integer: 1234
                            }
                        } ]
                    });
                });
                it("values can be specified on a new line", function() {
                    return shouldContainFields(expression("{\n    height =\n        80\n}"), {
                        isHash: true,
                        entries: [ {
                            field: [ "height" ],
                            value: {
                                integer: 80
                            }
                        } ]
                    });
                });
                it("should allow methods to be defined, redefining self", function() {
                    return shouldContainFields(expression("{say hi to (name, greeting: nil) = print (name)}"), {
                        isHash: true,
                        entries: [ {
                            field: [ "say", "hi", "to" ],
                            value: {
                                isBlock: true,
                                redefinesSelf: true,
                                body: {
                                    statements: [ {
                                        isFunctionCall: true,
                                        "function": {
                                            variable: [ "print" ]
                                        }
                                    } ]
                                },
                                parameters: [ {
                                    variable: [ "name" ]
                                } ],
                                optionalParameters: [ {
                                    isHashEntry: true,
                                    field: [ "greeting" ]
                                } ]
                            }
                        } ]
                    });
                });
                return it("hash with true entry", function() {
                    return shouldContainFields(expression("{port 1234, readonly}"), {
                        isHash: true,
                        entries: [ {
                            field: [ "port" ],
                            value: {
                                integer: 1234
                            }
                        }, {
                            field: [ "readonly" ],
                            value: undefined
                        } ]
                    });
                });
            });
        });
        describe("function calls", function() {
            it("function call", function() {
                return shouldContainFields(expression("touch (file)"), {
                    "function": {
                        variable: [ "touch" ]
                    },
                    functionArguments: [ {
                        variable: [ "file" ]
                    } ]
                });
            });
            it("function call with two arguments in parens", function() {
                return shouldContainFields(expression("f (a, b)"), {
                    "function": {
                        variable: [ "f" ]
                    },
                    functionArguments: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
            it("two expressions", function() {
                return shouldContainFields(expression("(x, y)"), {
                    isFunctionCall: true,
                    "function": {
                        variable: [ "x" ]
                    },
                    functionArguments: [ {
                        variable: [ "y" ]
                    } ]
                });
            });
            it("function call with splat argument", function() {
                return shouldContainFields(expression("touch (files) ..."), {
                    "function": {
                        variable: [ "touch" ]
                    },
                    functionArguments: [ {
                        variable: [ "files" ]
                    }, {
                        isSplat: true
                    } ]
                });
            });
            it("function call with splat argument", function() {
                return shouldContainFields(expression("copy (files, ..., dir)"), {
                    "function": {
                        variable: [ "copy" ]
                    },
                    functionArguments: [ {
                        variable: [ "files" ]
                    }, {
                        isSplat: true
                    }, {
                        variable: [ "dir" ]
                    } ]
                });
            });
            it("function call with no argument", function() {
                return shouldContainFields(expression("delete everything ()"), {
                    "function": {
                        variable: [ "delete", "everything" ]
                    },
                    functionArguments: []
                });
            });
            it("async function call with no arguments", function() {
                return shouldContainFields(expression("delete everything!"), terms.asyncStatements([ terms.functionCall(terms.variable([ "delete", "everything" ]), [], {
                    async: true
                }) ]).statements[0]);
            });
            it("function call with block with parameters", function() {
                return shouldContainFields(expression("with file (file) @(stream)\n  stream"), {
                    "function": {
                        variable: [ "with", "file" ]
                    },
                    functionArguments: [ {
                        variable: [ "file" ]
                    }, {
                        body: {
                            statements: [ {
                                variable: [ "stream" ]
                            } ]
                        },
                        parameters: [ {
                            variable: [ "stream" ]
                        } ]
                    } ]
                });
            });
            it("function call with block with long parameters", function() {
                return shouldContainFields(expression("open database @(database connection)\n  database connection"), {
                    "function": {
                        variable: [ "open", "database" ]
                    },
                    functionArguments: [ {
                        parameters: [ {
                            variable: [ "database", "connection" ]
                        } ],
                        body: {
                            statements: [ {
                                variable: [ "database", "connection" ]
                            } ]
                        }
                    } ]
                });
            });
            it("function call with two blocks with parameters", function() {
                return shouldContainFields(expression("name @(x) @{x} @ (y) @ {y}"), {
                    "function": {
                        variable: [ "name" ]
                    },
                    functionArguments: [ {
                        body: {
                            statements: [ {
                                variable: [ "x" ]
                            } ]
                        },
                        parameters: [ {
                            variable: [ "x" ]
                        } ]
                    }, {
                        body: {
                            statements: [ {
                                variable: [ "y" ]
                            } ]
                        },
                        parameters: [ {
                            variable: [ "y" ]
                        } ]
                    } ]
                });
            });
            return it("function call with two optional arguments", function() {
                return shouldContainFields(expression("name (a, port: 34, server: s)"), {
                    "function": {
                        variable: [ "name" ]
                    },
                    functionArguments: [ {
                        variable: [ "a" ]
                    } ],
                    optionalArguments: [ {
                        field: [ "port" ],
                        value: {
                            integer: 34
                        }
                    }, {
                        field: [ "server" ],
                        value: {
                            variable: [ "s" ]
                        }
                    } ]
                });
            });
        });
        describe("object operations", function() {
            it("method call", function() {
                return shouldContainFields(expression("object.method (argument)"), {
                    isMethodCall: true,
                    object: {
                        variable: [ "object" ]
                    },
                    name: [ "method" ],
                    methodArguments: [ {
                        variable: [ "argument" ]
                    } ]
                });
            });
            it("method call with optional arguments", function() {
                return shouldContainFields(expression("object.method (argument, view: view)"), {
                    isMethodCall: true,
                    object: {
                        variable: [ "object" ]
                    },
                    name: [ "method" ],
                    methodArguments: [ {
                        variable: [ "argument" ]
                    } ],
                    optionalArguments: [ {
                        field: [ "view" ],
                        value: {
                            variable: [ "view" ]
                        }
                    } ]
                });
            });
            it("field reference", function() {
                return shouldContainFields(expression("object.field"), {
                    isFieldReference: true,
                    object: {
                        variable: [ "object" ]
                    },
                    name: [ "field" ]
                });
            });
            it("field reference with newline", function() {
                return shouldContainFields(expression("object.\nfield"), {
                    isFieldReference: true,
                    object: {
                        variable: [ "object" ]
                    },
                    name: [ "field" ]
                });
            });
            it("indexer", function() {
                return shouldContainFields(expression("object.(x)"), {
                    isIndexer: true,
                    object: {
                        variable: [ "object" ]
                    },
                    indexer: {
                        variable: [ "x" ]
                    }
                });
            });
            it("parses no argument method with ()", function() {
                return shouldContainFields(expression("object.method()"), {
                    isMethodCall: true,
                    object: {
                        variable: [ "object" ]
                    },
                    name: [ "method" ],
                    methodArguments: []
                });
            });
            it("parses no argument method with () and field", function() {
                return shouldContainFields(expression("object.method().field"), {
                    isFieldReference: true,
                    object: {
                        isMethodCall: true,
                        object: {
                            variable: [ "object" ]
                        },
                        name: [ "method" ],
                        methodArguments: []
                    },
                    name: [ "field" ]
                });
            });
            it("parses no argument method with ! and field", function() {
                return shouldContainFields(expression("object.method! . field"), terms.asyncStatements([ terms.fieldReference(terms.methodCall(terms.variable([ "object" ]), [ "method" ], [], {
                    async: true
                }), [ "field" ]) ]).statements[0]);
            });
            return it("parses no argument method with ! and field", function() {
                return shouldContainFields(expression("object.method!.field"), terms.asyncStatements([ terms.fieldReference(terms.methodCall(terms.variable([ "object" ]), [ "method" ], [], {
                    async: true
                }), [ "field" ]) ]).statements[0]);
            });
        });
        describe("blocks", function() {
            it("empty block", function() {
                return shouldContainFields(expression("@{}"), {
                    isBlock: true,
                    parameters: [],
                    redefinesSelf: false,
                    body: {
                        statements: []
                    }
                });
            });
            it("block", function() {
                return shouldContainFields(expression("@{x, y}"), {
                    isBlock: true,
                    parameters: [],
                    redefinesSelf: false,
                    body: {
                        statements: [ {
                            variable: [ "x" ]
                        }, {
                            variable: [ "y" ]
                        } ]
                    }
                });
            });
            it("block with no parameters", function() {
                return shouldContainFields(expression("@() @{x}"), {
                    isBlock: true,
                    parameters: [],
                    redefinesSelf: false,
                    body: {
                        statements: [ {
                            variable: [ "x" ]
                        } ]
                    }
                });
            });
            it("block with parameter", function() {
                return shouldContainFields(expression("@(x)\n  x, y"), {
                    isBlock: true,
                    parameters: [ {
                        variable: [ "x" ]
                    } ],
                    redefinesSelf: false,
                    body: {
                        statements: [ {
                            variable: [ "x" ]
                        }, {
                            variable: [ "y" ]
                        } ]
                    }
                });
            });
            it("block in parens", function() {
                return shouldContainFields(expression("(one\n  two\n)"), {
                    isFunctionCall: true,
                    "function": {
                        variable: [ "one" ]
                    },
                    functionArguments: [ {
                        isBlock: true,
                        body: {
                            statements: [ {
                                variable: [ "two" ]
                            } ]
                        }
                    } ]
                });
            });
            return it("block with parameter, redefining self", function() {
                return shouldContainFields(expression("@(x) => @{x, y}"), {
                    isBlock: true,
                    parameters: [ {
                        variable: [ "x" ]
                    } ],
                    redefinesSelf: true,
                    body: {
                        statements: [ {
                            variable: [ "x" ]
                        }, {
                            variable: [ "y" ]
                        } ]
                    }
                });
            });
        });
        describe("statements", function() {
            it("can be separated by commas (,)", function() {
                return shouldContainFields(statements("a, b"), {
                    statements: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
            it("can be separated by unix new lines", function() {
                return shouldContainFields(statements("a\nb"), {
                    statements: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
            it("can be separated by windows new lines", function() {
                return shouldContainFields(statements("a\r\nb"), {
                    statements: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
            return it("windows indentation", function() {
                return shouldContainFields(statements("app (stuff) =\r\n  ok\r\n\r\nurl (path) =\r\n  ok"), {
                    statements: [ {
                        isDefinition: true
                    }, {
                        isDefinition: true
                    } ]
                });
            });
        });
        describe("operators", function() {
            it("should be lower precedence than object operation", function() {
                return shouldContainFields(expression("o.m 2 * o.x"), {
                    isOperator: true,
                    operator: "*",
                    operatorArguments: [ {
                        isMethodCall: true,
                        object: {
                            variable: [ "o" ]
                        },
                        name: [ "m" ],
                        methodArguments: [ {
                            integer: 2
                        } ]
                    }, {
                        isFieldReference: true,
                        object: {
                            variable: [ "o" ]
                        },
                        name: [ "x" ]
                    } ]
                });
            });
            it("unary operators should be higher precedence than binary operators", function() {
                return shouldContainFields(expression("a && ! b"), {
                    isOperator: true,
                    operator: "&&",
                    operatorArguments: [ {
                        variable: [ "a" ]
                    }, {
                        isOperator: true,
                        operator: "!",
                        operatorArguments: [ {
                            variable: [ "b" ]
                        } ]
                    } ]
                });
            });
            return it("can have newlines immediately after operator", function() {
                return shouldContainFields(expression("a &&\nb"), {
                    isOperator: true,
                    operator: "&&",
                    operatorArguments: [ {
                        variable: [ "a" ]
                    }, {
                        variable: [ "b" ]
                    } ]
                });
            });
        });
        describe("definition and assignment", function() {
            it("definition", function() {
                return shouldContainFields(expression("x = y"), {
                    isDefinition: true,
                    target: {
                        variable: [ "x" ]
                    },
                    source: {
                        variable: [ "y" ]
                    }
                });
            });
            it("assignment", function() {
                return shouldContainFields(expression("x := y"), {
                    isDefinition: true,
                    isAssignment: true,
                    target: {
                        variable: [ "x" ]
                    },
                    source: {
                        variable: [ "y" ]
                    }
                });
            });
            it("assignment on next line", function() {
                return shouldContainFields(expression("x =\n  y"), {
                    isDefinition: true,
                    target: {
                        variable: [ "x" ]
                    },
                    source: {
                        variable: [ "y" ]
                    }
                });
            });
            describe("function definition", function() {
                it("function with one parameter", function() {
                    return shouldContainFields(expression("func (x) = x"), {
                        isDefinition: true,
                        target: {
                            variable: [ "func" ]
                        },
                        source: {
                            parameters: [ {
                                variable: [ "x" ]
                            } ],
                            body: {
                                statements: [ {
                                    variable: [ "x" ]
                                } ]
                            }
                        }
                    });
                });
                return it("function with one parameter, and one optional parameter", function() {
                    return shouldContainFields(expression("func (x, port: 80) = x"), {
                        isDefinition: true,
                        target: {
                            variable: [ "func" ]
                        },
                        source: {
                            parameters: [ {
                                variable: [ "x" ]
                            } ],
                            optionalParameters: [ {
                                field: [ "port" ],
                                value: {
                                    integer: 80
                                }
                            } ],
                            body: {
                                statements: [ {
                                    variable: [ "x" ]
                                } ]
                            }
                        }
                    });
                });
            });
            it("field assignment", function() {
                return shouldContainFields(expression("o.x = y"), {
                    isDefinition: true,
                    target: {
                        isFieldReference: true,
                        object: {
                            variable: [ "o" ]
                        },
                        name: [ "x" ]
                    },
                    source: {
                        variable: [ "y" ]
                    }
                });
            });
            it("index assignment", function() {
                return shouldContainFields(expression("o.(x) = y"), {
                    isDefinition: true,
                    target: {
                        isIndexer: true,
                        object: {
                            variable: [ "o" ]
                        },
                        indexer: {
                            variable: [ "x" ]
                        }
                    },
                    source: {
                        variable: [ "y" ]
                    }
                });
            });
            it("assignment from field", function() {
                return shouldContainFields(expression("x = y.z"), {
                    isDefinition: true,
                    target: {
                        variable: [ "x" ]
                    },
                    source: {
                        isFieldReference: true,
                        object: {
                            variable: [ "y" ]
                        },
                        name: [ "z" ]
                    }
                });
            });
            it("assignment of async function", function() {
                return shouldContainFields(expression("x! = 8"), {
                    isDefinition: true,
                    target: {
                        variable: [ "x" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [],
                        body: {
                            statements: [ {
                                integer: 8
                            } ]
                        }
                    }
                });
            });
            it('definition of function with no arguments, using empty parens "()"', function() {
                return shouldContainFields(expression("x () = 8"), {
                    isDefinition: true,
                    target: {
                        variable: [ "x" ]
                    },
                    source: {
                        isBlock: true,
                        parameters: [],
                        body: {
                            statements: [ {
                                integer: 8
                            } ]
                        }
                    }
                });
            });
            it("assignment from method call", function() {
                return shouldContainFields(expression("x = y.z (a)"), {
                    isDefinition: true,
                    target: {
                        variable: [ "x" ]
                    },
                    source: {
                        isMethodCall: true,
                        object: {
                            variable: [ "y" ]
                        },
                        name: [ "z" ],
                        methodArguments: [ {
                            variable: [ "a" ]
                        } ]
                    }
                });
            });
            return it("field assignment from method call", function() {
                return shouldContainFields(expression("i.x = y.z (a)"), {
                    isDefinition: true,
                    target: {
                        isFieldReference: true,
                        object: {
                            variable: [ "i" ]
                        },
                        name: [ "x" ]
                    },
                    source: {
                        isMethodCall: true,
                        object: {
                            variable: [ "y" ]
                        },
                        name: [ "z" ],
                        methodArguments: [ {
                            variable: [ "a" ]
                        } ]
                    }
                });
            });
        });
        describe("regexps", function() {
            it("simple", function() {
                return shouldContainFields(expression("r/abc/"), {
                    isRegExp: true,
                    pattern: "abc"
                });
            });
            it("with options", function() {
                return shouldContainFields(expression("r/abc/img"), {
                    isRegExp: true,
                    pattern: "abc",
                    options: "img"
                });
            });
            it("with escaped back ticks", function() {
                return shouldContainFields(expression("r/abc\\/def\\/ghi/"), {
                    isRegExp: true,
                    pattern: "abc/def/ghi"
                });
            });
            it("with various escapes", function() {
                return shouldContainFields(expression("r/abc\\/def\\nghi\\/jkl/"), {
                    isRegExp: true,
                    pattern: "abc/def\\nghi/jkl"
                });
            });
            return it("with newline", function() {
                return shouldContainFields(expression("a = r/abc\n      def/"), {
                    isDefinition: true,
                    target: {
                        isVariable: true,
                        variable: [ "a" ]
                    },
                    source: {
                        isRegExp: true,
                        pattern: "abc\\ndef"
                    }
                });
            });
        });
        describe("comments", function() {
            it("should not treat comment-like syntax as comments in strings", function() {
                return shouldContainFields(statements("get 'http://pogoscript.org/'"), {
                    isStatements: true,
                    statements: [ {
                        isFunctionCall: true,
                        "function": {
                            variable: [ "get" ]
                        },
                        functionArguments: [ {
                            string: "http://pogoscript.org/"
                        } ]
                    } ]
                });
            });
            describe("should allow one-line C++ style comments, as in: // this is a comment", function() {
                it("when at the end of a line", function() {
                    return shouldContainFields(statements("a // this is a comment\nb"), {
                        isStatements: true,
                        statements: [ {
                            variable: [ "a" ]
                        }, {
                            variable: [ "b" ]
                        } ]
                    });
                });
                it("before an indented block", function() {
                    return shouldContainFields(statements("a // this is a comment\n  b"), {
                        isStatements: true,
                        statements: [ {
                            isFunctionCall: true,
                            "function": {
                                variable: [ "a" ]
                            },
                            functionArguments: [ {
                                isBlock: true,
                                body: {
                                    statements: [ {
                                        variable: [ "b" ]
                                    } ]
                                }
                            } ]
                        } ]
                    });
                });
                it("when at end of file", function() {
                    return shouldContainFields(statements("a // this is a comment"), {
                        isStatements: true,
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    });
                });
                return it("when between lines", function() {
                    return shouldContainFields(statements("a\n// this is a comment\nb"), {
                        isStatements: true,
                        statements: [ {
                            variable: [ "a" ]
                        }, {
                            variable: [ "b" ]
                        } ]
                    });
                });
            });
            return describe("should allow multi-line C style comments, as in: /* this is a comment */", function() {
                it("when on one line", function() {
                    return shouldContainFields(statements("a /* comment */ b"), {
                        statements: [ {
                            variable: [ "a", "b" ]
                        } ]
                    });
                });
                it("when there are two", function() {
                    return shouldContainFields(statements("a /* comment */ b /* another comment */ c"), {
                        statements: [ {
                            variable: [ "a", "b", "c" ]
                        } ]
                    });
                });
                it("when between lines", function() {
                    return shouldContainFields(statements("a\n/* comment */\nb\n/* another comment */\nc"), {
                        statements: [ {
                            variable: [ "a" ]
                        }, {
                            variable: [ "b" ]
                        }, {
                            variable: [ "c" ]
                        } ]
                    });
                });
                it("when it contains a * character", function() {
                    return shouldContainFields(statements("a /* sh*t */ b"), {
                        statements: [ {
                            variable: [ "a", "b" ]
                        } ]
                    });
                });
                it("when it covers two lines", function() {
                    return shouldContainFields(statements("a /* line one\nline two */ b"), {
                        statements: [ {
                            isVariable: true,
                            variable: [ "a", "b" ]
                        } ]
                    });
                });
                it("when it is terminated by the end of file", function() {
                    return shouldContainFields(statements("a /* comment to eof"), {
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    });
                });
                it("when it extends to the end of the file", function() {
                    return shouldContainFields(statements("a /* comment to end */"), {
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    });
                });
                return it("when it extends to the end of the file followed by newline", function() {
                    return shouldContainFields(statements("a /* comment to end */\n"), {
                        statements: [ {
                            variable: [ "a" ]
                        } ]
                    });
                });
            });
        });
        it("lexer", function() {
            var createParser, lexParser, tokens;
            createParser = require("../lib/parser/parser").createParser;
            lexParser = createParser({
                terms: terms
            });
            tokens = lexParser.lex("a (b)");
            return shouldContainFields(tokens, [ [ "identifier", "a" ], [ "(" ], [ "identifier", "b" ], [ ")" ], [ "eof" ] ]);
        });
        return it("ignores hash bang #!, at the beginning of the file", function() {
            return shouldContainFields(statements("#! /usr/bin/env pogo\na\nb"), terms.asyncStatements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]));
        });
    });
}).call(this);
});
require("/test/parserSpec.pogo");

require.define("/test/pogoSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var pogo, should;
    pogo = require("../lib/parser/compiler");
    should = require("should");
    describe("pogo", function() {
        it("can compile pogoscript", function() {
            return pogo.compile("x").should.equal("(function() {\n    var self = this;\n    x;\n}).call(this);");
        });
        return describe("evaluate", function() {
            it("can evaluate pogoscript", function() {
                return should.equal(pogo.evaluate("6"), 6);
            });
            it("can evaluate pogoscript without making globals", function() {
                pogo.evaluate("some pogo variable = 6");
                return global.hasOwnProperty("somePogoVariable").should.equal(false);
            });
            it("can evaluate pogoscript and make globals", function() {
                pogo.evaluate("some pogo variable = 6", {
                    global: true
                });
                global.hasOwnProperty("somePogoVariable").should.equal(true);
                return delete global.somePogoVariable;
            });
            it("can evaluate pogoscript and pass in a variable", function() {
                return pogo.evaluate("2 * x", {
                    definitions: {
                        x: 4
                    }
                }).should.equal(8);
            });
            return it("can evaluate async pogoscript", function(done) {
                return pogo.evaluate("process.next tick! (), done ()", {
                    definitions: {
                        done: done
                    }
                });
            });
        });
    });
}).call(this);
});
require("/test/pogoSpec.pogo");

require.define("/test/runtimeSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    require("../lib/parser/runtime");
    describe("runtime", function() {
        it("creates objects with constructor", function() {
            var obj;
            obj = object(function() {
                var self = this;
                return self.a = "a";
            });
            return obj.a.should.equal("a");
        });
        it("creates objects with hash", function() {
            var obj;
            obj = object({
                a: "a"
            });
            return obj.a.should.equal("a");
        });
        return describe("inheritance", function() {
            var prototype;
            prototype = void 0;
            beforeEach(function() {
                return prototype = object(function() {
                    var self = this;
                    self.a = "a";
                    return self.b = "b";
                });
            });
            it("allows objects to be extended", function() {
                var obj;
                obj = objectExtending(prototype, function() {
                    var self = this;
                    return self.b = "c";
                });
                obj.a.should.equal("a");
                return obj.b.should.equal("c");
            });
            return it("allows objects to be extended using hash", function() {
                var obj;
                obj = objectExtending(prototype, {
                    b: "c"
                });
                obj.a.should.equal("a");
                return obj.b.should.equal("c");
            });
        });
    });
}).call(this);
});
require("/test/runtimeSpec.pogo");

require.define("/test/scriptSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var script, assert, shouldOutput;
    script = require("./scriptAssertions");
    assert = require("assert");
    shouldOutput = script.shouldOutput;
    describe("script", function() {
        describe("integers", function() {
            return it("can denote an integer literally", function() {
                return shouldOutput("print 1", "1");
            });
        });
        describe("new operator", function() {
            it("can be called with no arguments", function() {
                return shouldOutput("print (new (Array))", "[]");
            });
            return it("new operator can be called with 1 argument", function() {
                return shouldOutput("print (new (Date 2010 10 9).value of())", "1289260800000");
            });
        });
        describe("== has semantics equivalent to === in JS", function() {
            it('returns false for equality of "" with 0', function() {
                return shouldOutput('print ("" == 0)', "false");
            });
            return it("returns true for identical strings", function() {
                return shouldOutput('print ("something" == "something")', "true");
            });
        });
        return describe("lists", function() {
            it("an empty list is just []", function() {
                return shouldOutput("print []", "[]");
            });
            it('list entries can be delimited with a comma ","', function() {
                return shouldOutput("print [1, 2]", "[ 1, 2 ]");
            });
            return it("list entries can be delimited with a newline", function() {
                return shouldOutput("print [\n    1\n    2\n]", "[ 1, 2 ]");
            });
        });
    });
}).call(this);
});
require("/test/scriptSpec.pogo");

require.define("/test/termSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var cg, Term, _, assert, shouldOnlyHave;
    cg = require("../lib/parser/codeGenerator").codeGenerator();
    require("./assertions");
    Term = require("../lib/terms/terms")({}).Term;
    _ = require("underscore");
    assert = require("assert");
    shouldOnlyHave = function(actualList, expectedList) {
        var gen1_items, gen2_i, item;
        actualList.length.should.equal(expectedList.length);
        gen1_items = expectedList;
        for (gen2_i = 0; gen2_i < gen1_items.length; ++gen2_i) {
            item = gen1_items[gen2_i];
            _.include(actualList, item).should.be;
        }
        return void 0;
    };
    describe("terms", function() {
        describe("cloning", function() {
            it("creates a new object", function() {
                var t, newTerm;
                t = new Term;
                newTerm = t.clone();
                return newTerm.should.not.equal(t);
            });
            it("copies all members when cloning", function() {
                var t, clone;
                t = new Term;
                t.a = 1;
                t.b = "b";
                clone = t.clone();
                return shouldContainFields(clone, {
                    a: 1,
                    b: "b"
                });
            });
            it("arrays are also cloned", function() {
                var t, clone;
                t = new Term;
                t.array = [ 1 ];
                clone = t.clone();
                clone.array.should.not.equal(t.array);
                return shouldContainFields(clone, {
                    array: [ 1 ]
                });
            });
            it("an object's prototype is also copied", function() {
                var t, clone;
                t = new Term;
                t.a = "a";
                clone = t.clone();
                return Object.getPrototypeOf(clone).should.equal(Object.getPrototypeOf(t));
            });
            it("clones sub-objects", function() {
                var t, clone;
                t = new Term;
                t.a = {
                    name: "jack"
                };
                clone = t.clone();
                return shouldContainFields(clone, {
                    a: {
                        name: "jack"
                    }
                });
            });
            it("doesn't clone objects that have 'dont clone' field", function() {
                var t, clone;
                t = new Term;
                t.a = {
                    name: "jack"
                };
                t.dontClone = true;
                clone = t.clone();
                return clone.should.equal(t);
            });
            it("can rewrite an object while being cloned", function() {
                var t, clone;
                t = new Term;
                t.a = new Term({
                    name: "jack"
                });
                clone = t.clone({
                    rewrite: function(oldTerm) {
                        var newTerm;
                        if (oldTerm.name) {
                            newTerm = new Term;
                            newTerm.name = "jill";
                            return newTerm;
                        }
                    }
                });
                return shouldContainFields(clone, {
                    a: {
                        name: "jill"
                    }
                });
            });
            it("rewrite is passed the clone function, which can be used to clone further members", function() {
                var t, clone;
                t = new Term;
                t.a = new Term({
                    name: "jack",
                    b: new Term({
                        name: "john"
                    })
                });
                clone = t.clone({
                    rewrite: function(oldTerm, gen3_options) {
                        var clone;
                        clone = gen3_options !== void 0 && Object.prototype.hasOwnProperty.call(gen3_options, "clone") && gen3_options.clone !== void 0 ? gen3_options.clone : void 0;
                        var newTerm;
                        if (oldTerm.name) {
                            newTerm = new Term;
                            newTerm.name = "jill";
                            if (oldTerm.b) {
                                newTerm.b = clone(oldTerm.b);
                            }
                            return newTerm;
                        }
                    }
                });
                return shouldContainFields(clone, {
                    a: {
                        name: "jill",
                        b: {
                            name: "jill"
                        }
                    }
                });
            });
            it("rewrite is passed the clone function, which can be used to clone the original node", function() {
                var t, clone;
                t = new Term;
                t.a = new Term({
                    name: "jack",
                    b: new Term({
                        name: "john"
                    })
                });
                clone = t.clone({
                    rewrite: function(oldTerm, gen4_options) {
                        var clone;
                        clone = gen4_options !== void 0 && Object.prototype.hasOwnProperty.call(gen4_options, "clone") && gen4_options.clone !== void 0 ? gen4_options.clone : void 0;
                        var newTerm;
                        if (oldTerm.name) {
                            newTerm = clone();
                            newTerm.name = "jill";
                            return newTerm;
                        }
                    }
                });
                return shouldContainFields(clone, {
                    a: {
                        name: "jill",
                        b: {
                            name: "jill"
                        }
                    }
                });
            });
            it("doesn't rewrite beyond rewrite limit", function() {
                var t, clone;
                t = new Term({
                    a: new Term({
                        name: "jack"
                    }),
                    b: new Term({
                        isLimit: true,
                        c: new Term({
                            name: "jack"
                        })
                    }),
                    d: new Term({
                        name: "jason"
                    })
                });
                clone = t.clone({
                    rewrite: function(oldTerm) {
                        if (oldTerm.name) {
                            return new Term({
                                name: "jill"
                            });
                        }
                    },
                    limit: function(t) {
                        return t.isLimit;
                    }
                });
                return shouldContainFields(clone, {
                    a: {
                        name: "jill"
                    },
                    b: {
                        c: {
                            name: "jack"
                        }
                    },
                    d: {
                        name: "jill"
                    }
                });
            });
            it("throws an exception when the new term is not an instance of 'term'", function() {
                var t;
                t = new Term;
                t.a = new Term({
                    name: "jack"
                });
                return function() {
                    return t.clone({
                        rewrite: function(oldTerm) {
                            if (oldTerm.name) {
                                return {
                                    name: "jill"
                                };
                            }
                        }
                    });
                }.should.throw("rewritten node not an instance of Node");
            });
            it("copies the location when a term is rewritten", function() {
                var t, clone;
                t = new Term;
                t.setLocation({
                    firstLine: 1,
                    lastLine: 1,
                    firstColumn: 20,
                    lastColumn: 30
                });
                clone = t.clone({
                    rewrite: function(oldTerm) {
                        var newTerm;
                        newTerm = new Term;
                        newTerm.rewritten = true;
                        return newTerm;
                    }
                });
                shouldContainFields(clone, {
                    rewritten: true
                });
                return shouldContainFields(clone.location(), {
                    firstLine: 1,
                    lastLine: 1,
                    firstColumn: 20,
                    lastColumn: 30
                });
            });
            it("passes path of terms to limit", function() {
                var c, b, a, y, x, t, paths, clone;
                c = new Term;
                b = new Term({
                    c: c
                });
                a = new Term({
                    b: b
                });
                y = new Term;
                x = new Term({
                    y: y
                });
                t = new Term({
                    a: a,
                    x: x
                });
                paths = [];
                clone = t.clone({
                    limit: function(oldTerm, gen5_options) {
                        var path;
                        path = gen5_options !== void 0 && Object.prototype.hasOwnProperty.call(gen5_options, "path") && gen5_options.path !== void 0 ? gen5_options.path : void 0;
                        paths.push(path.slice());
                        return false;
                    }
                });
                return shouldOnlyHave(paths, [ [], [ t ], [ t, a ], [ t, a, b ], [ t, x ], [ t, x, y ] ]);
            });
            return it("passes path of terms to rewrite", function() {
                var c, b, a, y, x, t, paths, clone;
                c = new Term;
                b = new Term({
                    c: c
                });
                a = new Term({
                    b: b
                });
                y = new Term;
                x = new Term({
                    y: y
                });
                t = new Term({
                    a: a,
                    x: x
                });
                paths = [];
                clone = t.clone({
                    rewrite: function(oldTerm, gen6_options) {
                        var path;
                        path = gen6_options !== void 0 && Object.prototype.hasOwnProperty.call(gen6_options, "path") && gen6_options.path !== void 0 ? gen6_options.path : void 0;
                        paths.push(path.slice());
                        return void 0;
                    }
                });
                return shouldOnlyHave(paths, [ [], [ t ], [ t, a ], [ t, a, b ], [ t, x ], [ t, x, y ] ]);
            });
        });
        describe("rewriting", function() {
            it("returns the same object", function() {
                var a;
                a = new Term({
                    b: new Term({
                        isCrazy: true
                    }),
                    c: new Term({
                        isCool: true
                    })
                });
                a.rewrite({
                    rewrite: function(term) {
                        if (term.isCool) {
                            return new Term({
                                isBad: true
                            });
                        }
                    }
                });
                return a.c.isBad.should.equal(true);
            });
            return it("limits the rewrite to a term", function() {
                var a;
                a = new Term({
                    b: new Term({
                        isCrazy: true,
                        d: new Term({
                            isCool: true
                        })
                    }),
                    c: new Term({
                        isCool: true
                    })
                });
                a.rewrite({
                    rewrite: function(term) {
                        if (term.isCool) {
                            return new Term({
                                isBad: true
                            });
                        }
                    },
                    limit: function(term) {
                        return term.isCrazy;
                    }
                });
                a.c.isBad.should.equal(true);
                return a.b.d.isCool.should.equal(true);
            });
        });
        describe("location", function() {
            it("can set location", function() {
                var t;
                t = new Term;
                t.setLocation({
                    firstLine: 1,
                    lastLine: 2,
                    firstColumn: 20,
                    lastColumn: 30
                });
                return shouldContainFields(t.location(), {
                    firstLine: 1,
                    lastLine: 2,
                    firstColumn: 20,
                    lastColumn: 30
                });
            });
            it("can compute location from children, first column is from first line, last column is from last line", function() {
                var left, right, t;
                left = new Term;
                left.setLocation({
                    firstLine: 1,
                    lastLine: 2,
                    firstColumn: 20,
                    lastColumn: 30
                });
                right = new Term;
                right.setLocation({
                    firstLine: 2,
                    lastLine: 4,
                    firstColumn: 30,
                    lastColumn: 10
                });
                t = new Term({
                    left: left,
                    right: right
                });
                return shouldContainFields(t.location(), {
                    firstLine: 1,
                    lastLine: 4,
                    firstColumn: 20,
                    lastColumn: 10
                });
            });
            it("if there are no children then the location is nil", function() {
                var t;
                t = new Term;
                return assert.strictEqual(t.location(), void 0);
            });
            it("if there are no children with locations then the location is nil", function() {
                var left, right, t;
                left = new Term;
                right = new Term;
                t = new Term({
                    left: left,
                    right: right
                });
                return assert.strictEqual(t.location(), void 0);
            });
            return it("can compute location from children, smallest first column, largest last column when on same line", function() {
                var left, right, t;
                left = new Term;
                left.setLocation({
                    firstLine: 1,
                    lastLine: 2,
                    firstColumn: 20,
                    lastColumn: 30
                });
                right = new Term;
                right.setLocation({
                    firstLine: 1,
                    lastLine: 2,
                    firstColumn: 10,
                    lastColumn: 40
                });
                t = new Term({
                    left: left,
                    right: right
                });
                return shouldContainFields(t.location(), {
                    firstLine: 1,
                    lastLine: 2,
                    firstColumn: 10,
                    lastColumn: 40
                });
            });
        });
        describe("children", function() {
            return it("returns immediate subterms", function() {
                var a, b, t;
                a = new Term;
                b = new Term;
                t = new Term({
                    a: a,
                    b: b
                });
                return shouldOnlyHave(t.children(), [ a, b ]);
            });
        });
        describe("children", function() {
            return it("returns terms in arrays", function() {
                var a, b, t;
                a = new Term;
                b = new Term;
                t = new Term({
                    array: [ a, b ]
                });
                return shouldOnlyHave(t.children(), [ a, b ]);
            });
        });
        describe("children", function() {
            return it("returns terms in objects", function() {
                var a, b, t;
                a = new Term;
                b = new Term;
                t = new Term({
                    array: {
                        a: a,
                        b: b
                    }
                });
                return shouldOnlyHave(t.children(), [ a, b ]);
            });
        });
        describe("walk descendants", function() {
            it("walks descendants, children, children's children, etc", function() {
                var b, c, d, a, t, descendants;
                b = new Term;
                c = new Term;
                d = new Term;
                a = new Term({
                    c: c,
                    d: [ d ]
                });
                t = new Term({
                    a: a,
                    b: b
                });
                descendants = [];
                t.walkDescendants(function(subterm) {
                    return descendants.push(subterm);
                });
                return shouldOnlyHave(descendants, [ a, b, c, d ]);
            });
            it("walks descendants, but not beyond the limit", function() {
                var b, c, d, a, t, descendants;
                b = new Term;
                c = new Term;
                d = new Term;
                a = new Term({
                    isA: true,
                    c: c,
                    d: [ d ]
                });
                t = new Term({
                    a: a,
                    b: b
                });
                descendants = [];
                t.walkDescendantsNotBelowIf(function(subterm) {
                    return descendants.push(subterm);
                }, function(subterm) {
                    return subterm.isA;
                });
                return shouldOnlyHave(descendants, [ a, b ]);
            });
            it("passes the path to the term to limit", function() {
                var b, c, d, a, t, descendants, paths;
                b = new Term({
                    isB: true
                });
                c = new Term({
                    isC: true
                });
                d = new Term({
                    isD: true
                });
                a = new Term({
                    isA: true,
                    c: c,
                    d: [ d ]
                });
                t = new Term({
                    a: a,
                    b: b
                });
                descendants = [];
                paths = [];
                t.walkDescendantsNotBelowIf(function(subterm) {
                    return void 0;
                }, function(subterm, path) {
                    paths.push(path.slice().concat([ subterm ]));
                    return false;
                });
                return shouldContainFields(paths, [ [ t, a ], [ t, a, c ], [ t, a, d ], [ t, b ] ]);
            });
            return it("passes the path to the term to the walker", function() {
                var b, c, d, a, t, descendants, paths;
                b = new Term({
                    isB: true
                });
                c = new Term({
                    isC: true
                });
                d = new Term({
                    isD: true
                });
                a = new Term({
                    isA: true,
                    c: c,
                    d: [ d ]
                });
                t = new Term({
                    a: a,
                    b: b
                });
                descendants = [];
                paths = [];
                t.walkDescendantsNotBelowIf(function(subterm, path) {
                    paths.push(path.slice().concat([ subterm ]));
                    return void 0;
                }, function(subterm, path) {
                    return false;
                });
                return shouldContainFields(paths, [ [ t, a ], [ t, a, c ], [ t, a, d ], [ t, b ] ]);
            });
        });
        return describe("reduce", function() {
            it("can be used to count total number of terms", function() {
                var t, sumOf, totalTermCount;
                t = new Term({
                    name: "t",
                    a: new Term({
                        name: "a",
                        b: new Term({
                            name: "b"
                        })
                    }),
                    x: [ new Term({
                        name: "u",
                        y: new Term({
                            name: "y"
                        })
                    }), new Term({
                        name: "z"
                    }) ]
                });
                sumOf = function(array) {
                    var sum;
                    return sum = _.reduce(array, function(sum, i) {
                        return sum + i;
                    }, 0);
                };
                totalTermCount = t.reduceWithReducedChildrenInto(function(term, terms) {
                    return 1 + sumOf(terms);
                });
                return totalTermCount.should.equal(6);
            });
            return it("reductions are cached, when given a cache name", function() {
                var t, sumOf, reductionCount, totalTermCount, firstReductionCount;
                t = new Term({
                    name: "t",
                    a: new Term({
                        name: "a",
                        b: new Term({
                            name: "b"
                        })
                    }),
                    x: [ new Term({
                        name: "u",
                        y: new Term({
                            name: "y"
                        })
                    }), new Term({
                        name: "z"
                    }) ]
                });
                sumOf = function(array) {
                    var sum;
                    return sum = _.reduce(array, function(sum, i) {
                        return sum + i;
                    }, 0);
                };
                reductionCount = 0;
                totalTermCount = t.reduceWithReducedChildrenInto(function(term, terms) {
                    ++reductionCount;
                    return 1 + sumOf(terms);
                }, {
                    cacheName: "term count"
                });
                firstReductionCount = reductionCount;
                t.reduceWithReducedChildrenInto(function(term, terms) {
                    ++reductionCount;
                    return 1 + sumOf(terms);
                }, {
                    cacheName: "term count"
                });
                return reductionCount.should.equal(firstReductionCount);
            });
        });
    });
}).call(this);
});
require("/test/termSpec.pogo");

require.define("/test/unaryOperatorExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var cg;
    cg = require("../lib/parser/codeGenerator").codeGenerator();
    require("./assertions");
    describe("unary operator expression", function() {
        it("as expression", function() {
            var opExpr;
            opExpr = cg.unaryOperatorExpression("@cat", {
                variable: [ "a" ]
            });
            return shouldContainFields(opExpr.expression(), {
                isFunctionCall: true,
                "function": {
                    variable: [ "cat" ]
                },
                functionArguments: [ {
                    variable: [ "a" ]
                } ]
            });
        });
        it("as expression with macro", function() {
            var opExpr;
            opExpr = cg.unaryOperatorExpression("!", {
                variable: [ "a" ]
            });
            return shouldContainFields(opExpr.expression(), {
                isOperator: true,
                operator: "!",
                operatorArguments: [ {
                    variable: [ "a" ]
                } ]
            });
        });
        return it("as hash entry will be semantic failure", function() {
            var opExpr;
            opExpr = cg.unaryOperatorExpression("%", {
                variable: [ "a" ]
            });
            return shouldContainFields(opExpr.hashEntry(), {
                isSemanticError: true
            });
        });
    });
}).call(this);
});
require("/test/unaryOperatorExpressionSpec.pogo");

require.define("/test/terms/breakStatementSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("break statement", function() {
        it("is never implicitly returned", function() {
            var breakStatement;
            breakStatement = terms.breakStatement();
            return breakStatement.rewriteResultTermInto().should.equal(breakStatement);
        });
        return describe("code generation", function() {
            return it("generates break expression", function() {
                var breakStatement;
                breakStatement = terms.breakStatement();
                return shouldGenerateStatement(breakStatement, "break;");
            });
        });
    });
}).call(this);
});
require("/test/terms/breakStatementSpec.pogo");

require.define("/test/terms/continueStatementSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("continue statement", function() {
        it("is never implicitly returned", function() {
            var continueStatement;
            continueStatement = terms.continueStatement();
            return continueStatement.rewriteResultTermInto().should.equal(continueStatement);
        });
        return describe("code generation", function() {
            return it("generates continue expression", function() {
                var continueStatement;
                continueStatement = terms.continueStatement();
                return shouldGenerateStatement(continueStatement, "continue;");
            });
        });
    });
}).call(this);
});
require("/test/terms/continueStatementSpec.pogo");

require.define("/test/terms/definitionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, should, codegenUtils, equals;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    should = require("should");
    codegenUtils = require("../../lib/terms/codegenUtils");
    equals = require("../containsFields").containsFields;
    describe("definitions", function() {
        var variables, scope, variable;
        variables = void 0;
        scope = void 0;
        variable = void 0;
        beforeEach(function() {
            scope = new terms.SymbolScope(void 0);
            variables = codegenUtils.declaredVariables(scope);
            variable = terms.variable([ "a", "b" ]);
            return terms.errors.clear();
        });
        return describe("declare variables", function() {
            var def;
            def = void 0;
            beforeEach(function() {
                return def = terms.definition(variable, terms.nil());
            });
            context("when shadow", function() {
                beforeEach(function() {
                    return def = terms.definition(variable, terms.nil(), {
                        shadow: true
                    });
                });
                it("should declare the variable", function() {
                    def.declareVariables(variables, scope);
                    return equals(variables.uniqueVariables(), [ "aB" ]);
                });
                return context("and when already in scope", function() {
                    beforeEach(function() {
                        return scope.define("aB");
                    });
                    return it("should still declare the variable", function() {
                        def.declareVariables(variables, scope);
                        return equals(variables.uniqueVariables(), [ "aB" ]);
                    });
                });
            });
            it("should declare the variable", function() {
                def.declareVariables(variables, scope);
                return equals(variables.uniqueVariables(), [ "aB" ]);
            });
            context("and when already in scope", function() {
                beforeEach(function() {
                    return scope.define("aB");
                });
                return it("should add an error saying that variable is already defined", function() {
                    def.declareVariables(variables, scope);
                    should.equal(terms.errors.hasErrors(), true);
                    return terms.errors.errors[0].message.should.match(/variable a b is already defined/);
                });
            });
            return context("when assignment", function() {
                beforeEach(function() {
                    return def = terms.definition(variable, terms.nil(), {
                        assignment: true
                    });
                });
                it("should add an error saying that variable is not yet defined", function() {
                    def.declareVariables(variables, scope);
                    should.equal(terms.errors.hasErrors(), true);
                    return terms.errors.errors[0].message.should.match(/variable a b is not defined/);
                });
                return context("and when already in scope", function() {
                    beforeEach(function() {
                        return scope.define("aB");
                    });
                    return it("should not declare the variable", function() {
                        def.declareVariables(variables, scope);
                        return equals(variables.uniqueVariables(), []);
                    });
                });
            });
        });
    });
}).call(this);
});
require("/test/terms/definitionSpec.pogo");

require.define("/test/terms/forExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, should;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    should = require("should");
    describe("for expression term", function() {
        return it("is never returned", function() {
            var forExpression;
            forExpression = terms.forExpression(terms.definition(terms.variable([ "i" ]), terms.integer(0)), terms.operator("<", [ terms.variable([ "i" ]), terms.integer(10) ]), terms.definition(terms.variable([ "i" ]), terms.operator("+", [ terms.variable([ "i" ]), terms.integer(1) ])), terms.statements([ terms.variable([ "x" ]) ]));
            return should.equal(forExpression.rewriteResultTermInto(), void 0);
        });
    });
}).call(this);
});
require("/test/terms/forExpressionSpec.pogo");

require.define("/test/terms/forInSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, should;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    should = require("should");
    describe("for in", function() {
        it("scopes body", function() {
            var forInExpression;
            forInExpression = terms.forIn(terms.variable([ "i" ]), terms.variable([ "items" ]), terms.statements([ terms.variable([ "i" ]) ]));
            return shouldContainFields(forInExpression.statements, terms.subExpression(terms.functionCall(terms.block([ terms.variable([ "i" ]) ], terms.statements([ terms.variable([ "i" ]) ]), {
                returnLastStatement: false
            }), [ terms.variable([ "i" ]) ])));
        });
        return it("never returns", function() {
            var forInExpression;
            forInExpression = terms.forIn(terms.variable([ "i" ]), terms.variable([ "items" ]), terms.statements([ terms.variable([ "i" ]) ]));
            return should.equal(forInExpression.rewriteResultTermInto(), void 0);
        });
    });
}).call(this);
});
require("/test/terms/forInSpec.pogo");

require.define("/test/terms/functionCallSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, shouldContainFields;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    shouldContainFields = require("../containsFields").containsFields;
    describe("function call", function() {
        return context("when the function call is asynchronous", function() {
            it("returns an async closure when blockify is called", function() {
                var functionCall, block;
                functionCall = terms.functionCall(terms.variable([ "func" ]), [], {
                    async: true
                });
                block = functionCall.blockify([]);
                return shouldContainFields(block, terms.closure([], terms.asyncStatements([ terms.functionCall(terms.variable([ "func" ]), [], {
                    async: true
                }) ])));
            });
            context("and a non-asynchronous block is passed", function() {
                return it("asyncifies the block", function() {
                    var functionCall, blockArg, expectedFunctionCall;
                    functionCall = terms.functionCall(terms.variable([ "func" ]), [ terms.closure([], terms.statements([ terms.variable([ "a" ]) ])) ], {
                        async: true
                    });
                    blockArg = terms.closure([], terms.statements([ terms.variable([ "a" ]) ]));
                    blockArg.asyncify();
                    expectedFunctionCall = terms.functionCall(terms.variable([ "func" ]), [ blockArg ], {
                        async: true
                    });
                    return shouldContainFields(functionCall, expectedFunctionCall);
                });
            });
            return context("and a non-asynchronous block is passed as an optional argument", function() {
                return it("asyncifies the block", function() {
                    var functionCall, blockArg, expectedFunctionCall;
                    functionCall = terms.functionCall(terms.variable([ "func" ]), [], {
                        optionalArguments: [ terms.hashEntry([ "block" ], terms.closure([], terms.statements([ terms.variable([ "a" ]) ]))) ],
                        async: true
                    });
                    blockArg = terms.closure([], terms.statements([ terms.variable([ "a" ]) ]));
                    blockArg.asyncify();
                    expectedFunctionCall = terms.functionCall(terms.variable([ "func" ]), [], {
                        optionalArguments: [ terms.hashEntry([ "block" ], blockArg) ],
                        async: true
                    });
                    return shouldContainFields(functionCall, expectedFunctionCall);
                });
            });
        });
    });
}).call(this);
});
require("/test/terms/functionCallSpec.pogo");

require.define("/test/terms/ifExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("if expression term", function() {
        describe("returning as last statement", function() {
            return it("returns last statement from then and else bodies", function() {
                var expression, expectedIfExpression;
                expression = terms.ifExpression([ {
                    condition: terms.variable([ "condition", "a" ]),
                    body: terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ])
                }, {
                    condition: terms.variable([ "condition", "b" ]),
                    body: terms.statements([ terms.variable([ "c" ]), terms.variable([ "d" ]) ])
                } ], terms.statements([ terms.variable([ "e" ]), terms.variable([ "f" ]) ]));
                expectedIfExpression = terms.ifExpression([ {
                    condition: terms.variable([ "condition", "a" ]),
                    body: terms.statements([ terms.variable([ "a" ]), terms.returnStatement(terms.variable([ "b" ]), {
                        implicit: true
                    }) ])
                }, {
                    condition: terms.variable([ "condition", "b" ]),
                    body: terms.statements([ terms.variable([ "c" ]), terms.returnStatement(terms.variable([ "d" ]), {
                        implicit: true
                    }) ])
                } ], terms.statements([ terms.variable([ "e" ]), terms.returnStatement(terms.variable([ "f" ]), {
                    implicit: true
                }) ]));
                expression.rewriteResultTermInto(function(term) {
                    return terms.returnStatement(term, {
                        implicit: true
                    });
                });
                return shouldContainFields(expression, expectedIfExpression);
            });
        });
        describe("asynchronous if", function() {
            context("when no else and only one case", function() {
                return it("calls an async if function, with body in a closure", function() {
                    var ifExpression, expectedAsyncIfExpression;
                    ifExpression = terms.ifExpression([ {
                        condition: terms.variable([ "condition" ]),
                        body: terms.statements([ terms.variable([ "async" ]) ], {
                            async: true
                        })
                    } ]);
                    expectedAsyncIfExpression = terms.functionCall(terms.generatedVariable([ "async", "if" ]), [ terms.variable([ "condition" ]), terms.closure([], terms.statements([ terms.variable([ "async" ]) ], {
                        async: true
                    })) ], {
                        async: true
                    });
                    return shouldContainFields(ifExpression, expectedAsyncIfExpression);
                });
            });
            return context("when there is an else and only one case", function() {
                return it("calls an async if else function, with body and else body in a closure", function() {
                    var ifExpression, body, expectedAsyncIfExpression;
                    ifExpression = terms.ifExpression([ {
                        condition: terms.variable([ "condition" ]),
                        body: terms.statements([ terms.variable([ "body" ]) ])
                    } ], terms.statements([ terms.variable([ "else", "body" ]) ], {
                        async: true
                    }));
                    body = terms.closure([], terms.statements([ terms.variable([ "body" ]) ]));
                    body.asyncify();
                    expectedAsyncIfExpression = terms.functionCall(terms.generatedVariable([ "async", "if", "else" ]), [ terms.variable([ "condition" ]), body, terms.closure([], terms.statements([ terms.variable([ "else", "body" ]) ], {
                        async: true
                    })) ], {
                        async: true
                    });
                    return shouldContainFields(ifExpression, expectedAsyncIfExpression);
                });
            });
        });
        return describe("code generation", function() {
            var ifExpression;
            ifExpression = void 0;
            beforeEach(function() {
                return ifExpression = terms.ifExpression([ {
                    condition: terms.variable([ "condition" ]),
                    body: terms.statements([ terms.variable([ "body" ]) ])
                } ], terms.statements([ terms.variable([ "else", "body" ]) ]));
            });
            context("as a statement", function() {
                return it("generates a regular js if statement", function() {
                    return shouldGenerateStatement(ifExpression, "if(condition){body;}else{elseBody;}");
                });
            });
            return context("as an expression", function() {
                return it("generates a scoped if statement, returning the last statement of each body", function() {
                    return shouldGenerateExpression(ifExpression, "(function(){if(condition){return body;}else{return elseBody;}})()");
                });
            });
        });
    });
}).call(this);
});
require("/test/terms/ifExpressionSpec.pogo");

require.define("/test/terms/interpolatedStringSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("interpolated string", function() {
        return describe("code generation", function() {
            return it("builds the string using the + operator", function() {
                var str;
                str = terms.interpolatedString([ terms.string("hello, "), terms.variable([ "name" ]) ]);
                return shouldGenerateStatement(str, "('hello, '+name);");
            });
        });
    });
}).call(this);
});
require("/test/terms/interpolatedStringSpec.pogo");

require.define("/test/terms/methodCallSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    describe("method call", function() {
        it("generates splat arguments", function() {
            var methodCall, expandedMethodCall;
            methodCall = terms.methodCall(terms.variable([ "object" ]), [ "method" ], [ terms.variable([ "args" ]), terms.splat() ]);
            expandedMethodCall = methodCall.expandMacros();
            return shouldContainFields(expandedMethodCall, terms.subStatements([ terms.definition(terms.generatedVariable([ "o" ]), terms.variable([ "object" ])), terms.methodCall(terms.fieldReference(terms.generatedVariable([ "o" ]), [ "method" ]), [ "apply" ], [ terms.generatedVariable([ "o" ]), terms.variable([ "args" ]) ]) ]));
        });
        it("generates splat arguments, passing optional argument as last", function() {
            var methodCall, expandedMethodCall;
            methodCall = terms.methodCall(terms.variable([ "object" ]), [ "method" ], [ terms.variable([ "args" ]), terms.splat() ], {
                optionalArguments: [ terms.hashEntry([ "port" ], terms.variable([ "p" ])) ]
            });
            expandedMethodCall = methodCall.expandMacros();
            return shouldContainFields(expandedMethodCall, terms.subStatements([ terms.definition(terms.generatedVariable([ "o" ]), terms.variable([ "object" ])), terms.methodCall(terms.fieldReference(terms.generatedVariable([ "o" ]), [ "method" ]), [ "apply" ], [ terms.generatedVariable([ "o" ]), terms.methodCall(terms.variable([ "args" ]), [ "concat" ], [ terms.list([ terms.hash([ terms.hashEntry([ "port" ], terms.variable([ "p" ])) ]) ]) ]) ]) ]));
        });
        it("returns self when no splat arguments", function() {
            var methodCall, expandedMethodCall;
            methodCall = terms.methodCall(terms.variable([ "object" ]), [ "method" ], [ terms.variable([ "args" ]) ]);
            expandedMethodCall = methodCall.expandMacros();
            return shouldContainFields(expandedMethodCall, terms.methodCall(terms.variable([ "object" ]), [ "method" ], [ terms.variable([ "args" ]) ]));
        });
        return context("when the method call is asynchronous", function() {
            context("and a non-asynchronous block is passed", function() {
                return it("asyncifies the block", function() {
                    var methodCall, blockArg, expectedMethodCall;
                    methodCall = terms.methodCall(terms.variable([ "obj" ]), [ "method" ], [ terms.closure([], terms.statements([ terms.variable([ "a" ]) ])) ], {
                        async: true
                    });
                    blockArg = terms.closure([], terms.statements([ terms.variable([ "a" ]) ]));
                    blockArg.asyncify();
                    expectedMethodCall = terms.methodCall(terms.variable([ "obj" ]), [ "method" ], [ blockArg ], {
                        async: true
                    });
                    return shouldContainFields(methodCall, expectedMethodCall);
                });
            });
            return context("and a non-asynchronous block is passed as an optional argument", function() {
                return it("asyncifies the block", function() {
                    var methodCall, blockArg, expectedMethodCall;
                    methodCall = terms.methodCall(terms.variable([ "obj" ]), [ "method" ], [], {
                        optionalArguments: [ terms.hashEntry([ "block" ], terms.closure([], terms.statements([ terms.variable([ "a" ]) ]))) ],
                        async: true
                    });
                    blockArg = terms.closure([], terms.statements([ terms.variable([ "a" ]) ]));
                    blockArg.asyncify();
                    expectedMethodCall = terms.methodCall(terms.variable([ "obj" ]), [ "method" ], [], {
                        optionalArguments: [ terms.hashEntry([ "block" ], blockArg) ],
                        async: true
                    });
                    return shouldContainFields(methodCall, expectedMethodCall);
                });
            });
        });
    });
}).call(this);
});
require("/test/terms/methodCallSpec.pogo");

require.define("/test/terms/moduleSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("module term", function() {
        describe("scoped module", function() {
            it("puts statements into a scope, passing the file `this`", function() {
                var module, bodyStatements, expectedModule;
                module = terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]));
                bodyStatements = terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]);
                expectedModule = terms.module(terms.statements([ terms.methodCall(terms.subExpression(terms.closure([], bodyStatements, {
                    returnLastStatement: false,
                    redefinesSelf: true
                })), [ "call" ], [ terms.variable([ "this" ]) ]) ]), {
                    inScope: false,
                    bodyStatements: bodyStatements
                });
                return shouldContainFields(module, expectedModule);
            });
            return context("with async statements", function() {
                return it("throws error in callback", function() {
                    var module, bodyStatements, expectedModule;
                    module = terms.module(terms.statements([ terms.variable([ "a" ]) ], {
                        async: true
                    }));
                    bodyStatements = terms.statements([ terms.variable([ "a" ]) ], {
                        async: true
                    });
                    expectedModule = terms.module(terms.statements([ terms.methodCall(terms.subExpression(terms.closure([], bodyStatements, {
                        returnLastStatement: false,
                        redefinesSelf: true
                    })), [ "call" ], [ terms.variable([ "this" ]), terms.closure([ terms.generatedVariable([ "error" ]) ], terms.statements([ terms.ifExpression([ {
                        condition: terms.generatedVariable([ "error" ]),
                        body: terms.statements([ terms.functionCall(terms.variable([ "set", "timeout" ]), [ terms.closure([], terms.statements([ terms.throwStatement(terms.generatedVariable([ "error" ])) ])), terms.integer(0) ]) ])
                    } ]) ])) ]) ]), {
                        inScope: false,
                        bodyStatements: bodyStatements
                    });
                    return shouldContainFields(module, expectedModule);
                });
            });
        });
        it("returns last statement, without a scope", function() {
            var module;
            module = terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]), {
                returnLastStatement: true,
                inScope: false
            });
            return shouldContainFields(module, terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.returnStatement(terms.variable([ "c" ]), {
                implicit: true
            }) ]), {
                inScope: false
            }));
        });
        it("doesn't return last statement, without a scope", function() {
            var module, expandedModule;
            module = terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]));
            module.inScope = false;
            expandedModule = module.expandMacros();
            return shouldContainFields(expandedModule, terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ])));
        });
        it("doesn't return last statement, without a scope, making global statements", function() {
            var module;
            module = terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]), {
                inScope: false,
                global: true
            });
            return shouldContainFields(module, terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ], {
                global: true
            }), {
                inScope: false,
                global: true
            }));
        });
        return describe("code generation", function() {
            it("generates statements", function() {
                var module;
                module = terms.module(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.variable([ "c" ]) ]), {
                    inScope: false
                });
                return shouldGenerateModule(module, "a;b;c;");
            });
            return it("generates module constants", function() {
                var module;
                module = terms.module(terms.statements([ terms.variable([ "a" ]) ]));
                terms.moduleConstants.defineAs([ "pi" ], terms.float(3.142));
                return shouldGenerateModule(module, "(function(){var self=this;var gen1_pi;gen1_pi=3.142;a;}).call(this);");
            });
        });
    });
}).call(this);
});
require("/test/terms/moduleSpec.pogo");

require.define("/test/terms/returnStatementSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("return statement", function() {
        it("is never implicitly returned", function() {
            var returnStatement;
            returnStatement = terms.returnStatement(terms.variable([ "a" ]));
            return returnStatement.rewriteResultTermInto().should.equal(returnStatement);
        });
        return describe("code generation", function() {
            it("generates return expression", function() {
                var returnStatement;
                returnStatement = terms.returnStatement(terms.variable([ "a" ]));
                return shouldGenerateStatement(returnStatement, "return a;");
            });
            return it("generates return void", function() {
                var returnStatement;
                returnStatement = terms.returnStatement();
                return shouldGenerateStatement(returnStatement, "return;");
            });
        });
    });
}).call(this);
});
require("/test/terms/returnStatementSpec.pogo");

require.define("/test/terms/splatArgumentsSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    describe("splat arguments", function() {
        it("returns the argument if there is only one", function() {
            var splatted;
            splatted = terms.splatArguments([ terms.variable([ "a" ]), terms.splat() ]);
            return shouldContainFields(splatted, terms.variable([ "a" ]));
        });
        it("puts leading arguments into a list", function() {
            var splatted;
            splatted = terms.splatArguments([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.splat() ]);
            return shouldContainFields(splatted, terms.methodCall(terms.list([ terms.variable([ "a" ]) ]), [ "concat" ], [ terms.variable([ "b" ]) ]));
        });
        return it("puts remaining arguments into a list", function() {
            var splatted;
            splatted = terms.splatArguments([ terms.variable([ "a" ]), terms.variable([ "b" ]), terms.splat(), terms.variable([ "c" ]), terms.variable([ "d" ]), terms.splat(), terms.variable([ "e" ]), terms.variable([ "f" ]) ]);
            return shouldContainFields(splatted, terms.methodCall(terms.methodCall(terms.methodCall(terms.methodCall(terms.list([ terms.variable([ "a" ]) ]), [ "concat" ], [ terms.variable([ "b" ]) ]), [ "concat" ], [ terms.list([ terms.variable([ "c" ]) ]) ]), [ "concat" ], [ terms.variable([ "d" ]) ]), [ "concat" ], [ terms.list([ terms.variable([ "e" ]), terms.variable([ "f" ]) ]) ]));
        });
    });
}).call(this);
});
require("/test/terms/splatArgumentsSpec.pogo");

require.define("/test/terms/statementsSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("statements term", function() {
        describe("code generation", function() {
            it("generates global variables", function() {
                var statements;
                statements = terms.statements([ terms.definition(terms.variable([ "a" ]), terms.integer(1)), terms.definition(terms.variable([ "b" ]), terms.integer(1)) ]);
                return shouldGenerateGlobalStatements(statements, "a=1;b=1;");
            });
            return it("generates local variables", function() {
                var statements;
                statements = terms.statements([ terms.definition(terms.variable([ "a" ]), terms.integer(1)), terms.definition(terms.variable([ "b" ]), terms.integer(1)) ]);
                return shouldGenerateStatements(statements, "var a,b;a=1;b=1;");
            });
        });
        return describe("returning last statement", function() {
            context("when async", function() {
                it("calls a callback function", function() {
                    var statements;
                    statements = terms.statements([ terms.variable([ "a" ]) ]);
                    statements.rewriteLastStatementToReturn({
                        async: true
                    });
                    return shouldContainFields(statements, terms.statements([ terms.functionCall(terms.callbackFunction, [ terms.nil(), terms.variable([ "a" ]) ]) ]));
                });
                return context("when last statement doesn't return a value", function() {
                    var statements;
                    statements = terms.statements([ terms.whileExpression(terms.variable([ "a" ]), terms.statements([ terms.variable([ "b" ]) ])) ]);
                    statements.rewriteLastStatementToReturn({
                        async: true
                    });
                    return shouldContainFields(statements, terms.statements([ terms.whileExpression(terms.variable([ "a" ]), terms.statements([ terms.variable([ "b" ]) ])), terms.functionCall(terms.callbackFunction, [ terms.nil(), terms.nil() ]) ]));
                });
            });
            return context("when not async", function() {
                return it("uses the return statement", function() {
                    var statements;
                    statements = terms.statements([ terms.variable([ "a" ]) ]);
                    statements.rewriteLastStatementToReturn();
                    return shouldContainFields(statements, terms.statements([ terms.returnStatement(terms.variable([ "a" ]), {
                        implicit: true
                    }) ]));
                });
            });
        });
    });
}).call(this);
});
require("/test/terms/statementsSpec.pogo");

require.define("/test/terms/throwStatementSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("throw statement", function() {
        it("is never returned", function() {
            var throwStatement;
            throwStatement = terms.throwStatement(terms.variable([ "a" ]));
            return throwStatement.rewriteResultTermInto().should.equal(throwStatement);
        });
        return describe("code generation", function() {
            return it("generates throw", function() {
                return shouldGenerateStatement(terms.throwStatement(terms.variable([ "a" ])), "throw a;");
            });
        });
    });
}).call(this);
});
require("/test/terms/throwStatementSpec.pogo");

require.define("/test/terms/tryExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    describe("try expression term", function() {
        describe("returning as last statement", function() {
            return it("returns last statement from body and catch body", function() {
                var tryExpression, expectedTryExpression;
                tryExpression = terms.tryExpression(terms.statements([ terms.variable([ "a" ]), terms.variable([ "b" ]) ]), {
                    catchBody: terms.statements([ terms.variable([ "c" ]), terms.variable([ "d" ]) ]),
                    catchParameter: terms.variable([ "e" ])
                });
                expectedTryExpression = terms.tryExpression(terms.statements([ terms.variable([ "a" ]), terms.returnStatement(terms.variable([ "b" ]), {
                    implicit: true
                }) ]), {
                    catchBody: terms.statements([ terms.variable([ "c" ]), terms.returnStatement(terms.variable([ "d" ]), {
                        implicit: true
                    }) ]),
                    catchParameter: terms.variable([ "e" ])
                });
                tryExpression.rewriteResultTermInto(function(term) {
                    return terms.returnStatement(term, {
                        implicit: true
                    });
                });
                return shouldContainFields(tryExpression, expectedTryExpression);
            });
        });
        return describe("when any of the bodies are asynchronous", function() {
            return it("generates a call to an asynchronous try function", function() {
                var tryExpression, body, catchBody, finallyBody, expectedTryExpression;
                tryExpression = terms.tryExpression(terms.statements([ terms.variable([ "a" ]) ], {
                    async: true
                }), {
                    catchBody: terms.statements([ terms.variable([ "error" ]) ]),
                    catchParameter: terms.variable([ "error" ]),
                    finallyBody: terms.statements([ terms.variable([ "error" ]) ])
                });
                body = terms.closure([], terms.statements([ terms.variable([ "a" ]) ], {
                    async: true
                }));
                catchBody = terms.closure([ terms.variable([ "error" ]) ], terms.statements([ terms.variable([ "error" ]) ]));
                catchBody.asyncify();
                finallyBody = terms.closure([], terms.statements([ terms.variable([ "error" ]) ]));
                finallyBody.asyncify();
                expectedTryExpression = terms.functionCall(terms.generatedVariable([ "async", "try" ]), [ body, catchBody, finallyBody ], {
                    async: true
                });
                return shouldContainFields(tryExpression, expectedTryExpression);
            });
        });
    });
}).call(this);
});
require("/test/terms/tryExpressionSpec.pogo");

require.define("/test/terms/whileExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, should;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    should = require("should");
    describe("while expression", function() {
        it("is never implicitly returned", function() {
            var whileExpression;
            whileExpression = terms.whileExpression(terms.variable([ "condition" ]), terms.statements([ terms.variable([ "body" ]) ]));
            return should.equal(whileExpression.rewriteResultTermInto(), void 0);
        });
        return describe("code generation", function() {
            return it("generates while expression", function() {
                var whileExpression;
                whileExpression = terms.whileExpression(terms.variable([ "condition" ]), terms.statements([ terms.variable([ "body" ]) ]));
                return shouldGenerateStatement(whileExpression, "while(condition){body;}");
            });
        });
    });
}).call(this);
});
require("/test/terms/whileExpressionSpec.pogo");

require.define("/test/terms/withExpressionSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms;
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    require("../assertions");
    require("../codeGeneratorAssertions");
    describe("with expression", function() {
        it("is never implicitly returned", function() {
            var withExpression;
            withExpression = terms.withExpression(terms.variable([ "subject" ]), terms.statements([ terms.variable([ "body" ]) ]));
            return withExpression.rewriteResultTermInto().should.equal(withExpression);
        });
        return describe("code generation", function() {
            return it("generates with expression", function() {
                var withExpression;
                withExpression = terms.withExpression(terms.variable([ "subject" ]), terms.statements([ terms.variable([ "body" ]) ]));
                return shouldGenerateStatement(withExpression, "with(subject){body;}");
            });
        });
    });
}).call(this);
});
require("/test/terms/withExpressionSpec.pogo");

require.define("/test/parser/operatorParserSpec.pogo",function(require,module,exports,__dirname,__filename,process,global){(function() {
    var self = this;
    var terms, _;
    require("../assertions");
    require("../parserAssertions");
    terms = require("../../lib/parser/codeGenerator").codeGenerator();
    _ = require("underscore");
    describe("operator expression", function() {
        var variable, compilationMap, compilesTo, compiledNameFor, isHigherInPrecedenceThan, operatorsInOrderOfPrecedence, theLeftOperatorHasHigherPrecedenceThanTheRightOperator, areTheSamePrecedenceAndAreLeftAssociative, itParsesUnaryOperator, unaryOperators, gen1_items, gen2_i, op;
        variable = function(name) {
            return terms.complexExpression([ [ terms.variable([ name ]) ] ]);
        };
        it("parses operators, using precedence table", function() {
            return shouldContainFields(expression("a @and b"), terms.operator("&&", [ terms.variable([ "a" ]), terms.variable([ "b" ]) ]));
        });
        compilationMap = {};
        compilesTo = function(name, jsOpName) {
            return compilationMap[name] = jsOpName;
        };
        compiledNameFor = function(name) {
            if (Object.hasOwnProperty.call(compilationMap, name)) {
                return compilationMap[name];
            } else {
                return name;
            }
        };
        compilesTo("@and", "&&");
        compilesTo("@or", "||");
        compilesTo("==", "===");
        compilesTo("!=", "!==");
        compilesTo("@not", "!");
        isHigherInPrecedenceThan = function(higher, lower) {
            it("parses " + higher + " as higher precedence than " + lower, function() {
                return shouldContainFields(expression("a " + higher + " b " + lower + " c"), terms.operator(compiledNameFor(lower), [ terms.operator(compiledNameFor(higher), [ terms.variable([ "a" ]), terms.variable([ "b" ]) ]), terms.variable([ "c" ]) ]));
            });
            return it("parses " + lower + " as lower precedence than " + higher, function() {
                return shouldContainFields(expression("a " + lower + " b " + higher + " c"), terms.operator(compiledNameFor(lower), [ terms.variable([ "a" ]), terms.operator(compiledNameFor(higher), [ terms.variable([ "b" ]), terms.variable([ "c" ]) ]) ]));
            });
        };
        describe("custom operators", function() {
            it("throws when a custom operator is used before other operators", function() {
                var operator;
                operator = terms.operatorExpression(variable("a"));
                operator.addOperatorExpression("@custom", variable("b"));
                operator.addOperatorExpression("@and", variable("c"));
                return function() {
                    return operator.expression();
                }.should.throw("@custom cannot be used with other operators");
            });
            it("throws when a custom operator is used after other operators", function() {
                var operator;
                operator = terms.operatorExpression(variable("a"));
                operator.addOperatorExpression("@and", variable("b"));
                operator.addOperatorExpression("@custom", variable("c"));
                return function() {
                    return operator.expression();
                }.should.throw("@custom cannot be used with other operators");
            });
            it("parses two custom unary operators, outer to inner", function() {
                return shouldContainFields(expression("@outer @inner a"), terms.functionCall(terms.variable([ "outer" ]), [ terms.functionCall(terms.variable([ "inner" ]), [ terms.variable([ "a" ]) ]) ]));
            });
            it("parses @custom unary operator as function call", function() {
                return shouldContainFields(expression("@custom a"), terms.functionCall(terms.variable([ "custom" ]), [ terms.variable([ "a" ]) ]));
            });
            return it("parses camel case custom operators", function() {
                return shouldContainFields(expression("@customOp a"), terms.functionCall(terms.variable([ "customOp" ]), [ terms.variable([ "a" ]) ]));
            });
        });
        operatorsInOrderOfPrecedence = [ [ "/", "*", "%" ], [ "-", "+" ], [ "<<", ">>", ">>>" ], [ ">", ">=", "<", "<=" ], [ "==", "!=" ], "&", "^", "|", [ "&&", "@and" ], [ "||", "@or" ] ];
        theLeftOperatorHasHigherPrecedenceThanTheRightOperator = function(left, right) {
            return shouldContainFields(expression("a " + left + " b " + right + " c"), terms.operator(compiledNameFor(right), [ terms.operator(compiledNameFor(left), [ terms.variable([ "a" ]), terms.variable([ "b" ]) ]), terms.variable([ "c" ]) ]));
        };
        areTheSamePrecedenceAndAreLeftAssociative = function(operators) {
            return _.reduce(operators, function(left, right) {
                it("parses " + left + " with the same precedence as " + right + " and both are left associative", function() {
                    theLeftOperatorHasHigherPrecedenceThanTheRightOperator(left, right);
                    return theLeftOperatorHasHigherPrecedenceThanTheRightOperator(right, left);
                });
                return right;
            });
        };
        _.reduce(operatorsInOrderOfPrecedence, function(higher, lower) {
            if (higher instanceof Array) {
                areTheSamePrecedenceAndAreLeftAssociative(higher);
                if (lower instanceof Array) {
                    isHigherInPrecedenceThan(higher[0], lower[0]);
                } else {
                    isHigherInPrecedenceThan(higher[0], lower);
                }
            } else {
                if (lower instanceof Array) {
                    isHigherInPrecedenceThan(higher, lower[0]);
                } else {
                    isHigherInPrecedenceThan(higher, lower);
                }
            }
            return lower;
        });
        itParsesUnaryOperator = function(op) {
            return it("should parse unary " + op, function() {
                return shouldContainFields(expression(op + " a"), {
                    operator: compiledNameFor(op),
                    operatorArguments: [ {
                        variable: [ "a" ],
                        isVariable: true
                    } ]
                });
            });
        };
        unaryOperators = [ "!", "@not", "~", "+", "-" ];
        gen1_items = unaryOperators;
        for (gen2_i = 0; gen2_i < gen1_items.length; ++gen2_i) {
            op = gen1_items[gen2_i];
            itParsesUnaryOperator(op);
        }
        return void 0;
    });
}).call(this);
});
require("/test/parser/operatorParserSpec.pogo");
})();
