(function() {
    var self, jisonParser, terms, ms, createParserContext, createDynamicLexer, grammar, parser, jisonLexer, createParser, withoutCStyleComments, withoutCPlusPlusStyleComments, withoutComments;
    self = this;
    jisonParser = require("jison").Parser;
    terms = require("./codeGenerator/codeGenerator");
    ms = require("../lib/memorystream");
    createParserContext = require("./parserContext").createParserContext;
    createDynamicLexer = require("./dynamicLexer").createDynamicLexer;
    grammar = require("./grammar").grammar;
    parser = new jisonParser(grammar);
    jisonLexer = parser.lexer;
    createParser = function() {
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
        return parser;
    };
    withoutCStyleComments = function(s) {
        return s.replace(/\/\*([^*](\*[^\/]|))*(\*\/|$)/gm, function(comment) {
            return comment.replace(/./g, " ");
        });
    };
    withoutCPlusPlusStyleComments = function(s) {
        return s.replace(/\/\/[^\n]*/gm, function(comment) {
            return comment.replace(/./g, " ");
        });
    };
    withoutComments = self.withoutComments = function(s) {
        var self;
        self = this;
        return withoutCStyleComments(withoutCPlusPlusStyleComments(s));
    };
    self.parse = function(source) {
        var self;
        self = this;
        parser = createParser();
        return parser.parse(withoutComments(source));
    };
    self.writeParserToFile = function(f) {
        var self, parserSource, fs;
        self = this;
        parserSource = createParser().generate();
        fs = require("fs");
        return fs.writeFileSync("jisonParser.js", parserSource, "utf-8");
    };
    self.lex = function(source) {
        var self, tokens, tokenIndex, lexer, parserContext;
        self = this;
        tokens = [];
        tokenIndex = undefined;
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
        while (tokenIndex != 1) {
            var token, text, lexerToken;
            token = function() {
                if (typeof tokenIndex == "number") {
                    return parser.terminals_[tokenIndex];
                } else if (tokenIndex == "") {
                    return undefined;
                } else {
                    return tokenIndex;
                }
            }();
            text = function() {
                if (lexer.yytext == "") {
                    return undefined;
                } else if (lexer.yytext == token) {
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
    };
}).call(this);