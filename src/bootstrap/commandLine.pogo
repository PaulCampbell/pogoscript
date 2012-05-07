fs = require 'fs'
ms = require '../lib/memorystream'
parser = require './parser'
parse = parser.parse
uglify = require 'uglify-js'
errors = require './codeGenerator/errors'
_ = require 'underscore'
readline = require 'readline'
util = require 'util'
Module = require 'module'
path = require 'path'

generate code (term) =
    memory stream = new (ms.MemoryStream)
    term.generate java script (memory stream)
    memory stream.to string ()

beautify (code) =
    ast = uglify.parser.parse (code)
    uglify.uglify.gen_code (ast, beautify: true)

exports.compile file = compile file (filename, ugly: false) =
    js = compile from file (filename, ugly: ugly)

    js filename = js filename from pogo filename (filename)
    fs.write file sync (js filename, js)

when (filename) changes (act) =
    fs.watch file (filename) {persistent, interval 500} @(prev, curr)
        if ((curr.size == prev.size) && (curr.mtime.get time () == prev.mtime.get time ()))
            return
        
        act ()

exports.watch file (filename, options) =
    compile () =
        console.log "compiling #(filename) => #(js filename from pogo filename (filename))"
        compile file (filename, options)

    compile ()

    when (filename) changes
        compile ()

exports.lex file (filename) =
    source = fs.read file sync (filename) 'utf-8'
    tokens = parser.lex (source)

    for each @(token) in (tokens)
        text = (token.1 && "'#(token.1)'") || ''
        console.log "<#(token.0)> #(text)"

js filename from pogo filename (pogo) =
    pogo.replace `\.pogo$` '' + '.js'

exports.run file (filename) in module (module) =
    js = compile from file (filename)
    module._compile (js, filename)

exports.run main (filename) =
    full filename = fs.realpath sync (filename)
    
    process.argv.shift ()
    process.argv.0 = 'pogo'
    process.argv.1 = full filename
    
    module = new (Module (full filename, null))
    process.main module = module
    module.id = '.'
    module.filename = full filename
    module.paths = Module._node module paths (path.dirname (full filename))
    exports.run file (full filename) in module (module)
    module.loaded = true

exports.compile (pogo, filename: nil, in scope: true, ugly: false, global: false, return result: false) =
    module term = parse (pogo)
    module term.in scope = in scope
    module term.global = global
    module term.return result = return result

    code = generate code (module term)

    if (!ugly)
        code = beautify (code)

    if (errors.has errors ())
        errors.print errors (source location printer (filename: filename, source: pogo))
        process.exit 1
    else
        code

exports.evaluate (pogo, definitions: {}, global: false) =
    js = exports.compile (pogo, ugly: true, in scope: !global, global: global, return result: global)
    definition names = _.keys (definitions)
    
    parameters = definition names.join ','
    
    run script = new (Function (parameters, js))
    
    definition values = _.map (definition names) @(name)
        definitions.(name)
    
    run script.apply (undefined) (definition values)

exports.repl () =
    interface = readline.create interface (process.stdin, process.stdout)
    prompt = 'λ '

    interface.set prompt (prompt, prompt.length)
    interface.prompt ()

    interface.on 'line' @(line)
        evalute repl line (line)
        interface.prompt ()

    interface.on 'close'
        process.stdout.write "\n"
        process.exit 0

evalute repl line (line) =
    try
        result = exports.evaluate (line, global: true)
        console.log ' =>' (util.inspect (result, undefined, undefined, true))
    catch @(ex)
        console.log (ex.message)

compile from file (filename, ugly: false) =
    contents = fs.read file sync (filename) 'utf-8'
    exports.compile (contents, filename: filename, ugly: ugly)
        
source location printer (filename: nil, source: nil) =
    object =>
        self.lines in range (range) =
            lines = source.split `\n`
            lines.slice (range.from - 1) (range.to)

        self.print lines in range (prefix: '', from: nil, to: nil) =
            for each @(line) in (self.lines in range (from: from, to: to))
                process.stderr.write (prefix + line + "\n")

        self.print location (location) =
            process.stderr.write (filename + ':' + location.first line + "\n")

            if (location.first line == location.last line)
                self.print lines in range; from (location.first line); to (location.last line)
                spaces = self.' ' times (location.first column)
                markers = self.'^' times (location.last column - location.first column)
                process.stderr.write (spaces + markers + "\n")
            else
                self.print lines in range; prefix '> '; from (location.first line); to (location.last line)

        self.(s) times (n) =
            strings = []
            for (i = 0, i < n, i = i + 1)
                strings.push (s)

            strings.join ''

require.extensions.'.pogo' (module, filename) =
    exports.run file (filename) in module (module)
