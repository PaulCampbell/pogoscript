(function() {
    var self, jisonParser, terms, ms, createParserWithGrammar, identifierPattern, grammar, parser;
    self = this;
    jisonParser = require("jison").Parser;
    terms = require("./codeGenerator/codeGenerator");
    ms = require("../lib/memorystream");
    createParserWithGrammar = function(grammar) {
        return new jisonParser(grammar);
    };
    identifierPattern = "[a-zA-Z_$][a-zA-Z_$0-9]*";
    grammar = {
        lex: {
            startConditions: {
                interpolated_string: true,
                interpolated_string_terminal: true
            },
            rules: [ [ "\\s+", "/* ignore whitespace */" ], [ "[0-9]+\\.[0-9]+", "return 'float';" ], [ "[0-9]+", "return 'integer';" ], [ "@" + identifierPattern, "return 'argument';" ], [ "@:" + identifierPattern, "return 'self_argument';" ], [ "\\?" + identifierPattern, "return 'parameter';" ], [ identifierPattern, "return 'identifier';" ], [ "\\??\\(", "if (yy.interpolation.interpolating()) {yy.interpolation.openBracket()} return yytext;" ], [ "\\)", "if (yy.interpolation.interpolating()) {yy.interpolation.closeBracket(); if (yy.interpolation.finishedInterpolation()) {this.popState(); this.popState(); yy.interpolation.stopInterpolation()}} return ')';" ], [ "{", "return '{';" ], [ "}", "return '}';" ], [ "\\[", "return '[';" ], [ "\\]", "return ']';" ], [ "\\\\[.]", "return yytext.substring(1);" ], [ "\\\\@[{]", "if (!yy.stringBrackets) {return yytext.substring(1);} else {++yy.stringBrackets;}" ], [ "\\\\[}]", "if (!yy.stringBrackets) {return yytext.substring(1);} else {--yy.stringBrackets;}" ], [ "\\.\\.\\.", "return '...'" ], [ "([:=,?!.@`~#$%^&*+<>/?|-]|\\\\\\\\)+", "return yy.lexOperator(yytext);" ], [ "$", "return 'eof';" ], [ "'([^']*'')*[^']*'", "return 'string';" ], [ '"', "this.begin('interpolated_string'); return 'start_interpolated_string';" ], [ [ "interpolated_string" ], "@", "this.begin('interpolated_string_terminal'); return 'interpolated_string_terminal_start';" ], [ [ "interpolated_string_terminal" ], identifierPattern, "this.popState(); return 'identifier';" ], [ [ "interpolated_string_terminal" ], "\\(", "yy.interpolation.startInterpolation(); this.begin('INITIAL'); return '(';" ], [ [ "interpolated_string" ], '"', "this.popState(); return 'end_interpolated_string';" ], [ [ "interpolated_string" ], "\\\\[.]", "/* ignore */" ], [ [ "interpolated_string" ], "\\\\[{]", "yy.stringBrackets++" ], [ [ "interpolated_string" ], "\\\\[}]", "yy.stringBrackets--;" ], [ [ "interpolated_string" ], "\\\\\\\\\\\\\\\\", "return 'escaped_escape_interpolated_string_body';" ], [ [ "interpolated_string" ], "\\\\\\\\.", "return 'escaped_interpolated_string_body';" ], [ [ "interpolated_string" ], '[^"@\\\\]*', "return 'interpolated_string_body';" ], [ ".", "return 'non_token';" ] ]
        },
        operators: [ [ "right", "=" ], [ "left", ":" ] ],
        start: "module",
        bnf: {
            module: [ [ "statements eof", "return yy.module($1);" ] ],
            statements: [ [ "statements_list", "$$ = yy.statements($1);" ] ],
            hash_entries: [ [ "hash_entries comma_dot basic_expression", "$1.push($3.hashEntry()); $$ = $1;" ], [ "basic_expression", "$$ = [$1.hashEntry()];" ], [ "", "$$ = [];" ] ],
            comma_dot: [ [ ".", "$$ = $1;" ], [ ",", "$$ = $1;" ] ],
            statements_list: [ [ "statements_list . statement", "$1.push($3); $$ = $1;" ], [ "statement", "$$ = [$1];" ], [ "", "$$ = [];" ] ],
            statement: [ [ "expression", "$$ = $1.expression();" ] ],
            expression: [ [ "expression = expression", "$$ = $1.definition($3.expression());" ], [ "operator_expression", "$$ = $1;" ] ],
            operator_expression: [ [ "operator_expression operator unary_operator_expression", "$1.addOperatorExpression($2, $3); $$ = $1;" ], [ "unary_operator_expression", "$$ = yy.operatorExpression($1);" ] ],
            unary_operator_expression: [ [ "object_operation", "$$ = $1;" ], [ "unary_operator object_operation", "$$ = yy.newUnaryOperatorExpression({operator: $1, expression: $2.expression()});" ] ],
            object_operation: [ [ "object_operation : complex_expression", "$$ = $3.objectOperation($1.expression());" ], [ ": complex_expression", "$$ = $2.objectOperation(yy.selfExpression());" ], [ "complex_expression", "$$ = $1;" ] ],
            complex_expression: [ [ "basic_expression_list", "$$ = yy.complexExpression($1);" ] ],
            basic_expression_list: [ [ "basic_expression_list , terminal_list", "$1.push($3); $$ = $1;" ], [ "terminal_list_no_arg", "$$ = [$1];" ] ],
            terminal_list_no_arg: [ [ "terminal_list no_arg_punctuation", "$1.push($2); $$ = $1;" ], [ "terminal_list", "$$ = $1;" ] ],
            basic_expression: [ [ "terminal_list", "$$ = yy.basicExpression($1);" ] ],
            no_arg_punctuation: [ [ "no_arg", "$$ = yy.loc(yy.noArgSuffix(), @$);" ] ],
            no_arg: [ [ "!", "$$ = $1;" ], [ "?", "$$ = $1;" ] ],
            terminal_list: [ [ "terminal_list terminal", "$1.push($2); $$ = $1;" ], [ "terminal", "$$ = [$1];" ] ],
            terminal: [ [ "( statement )", "$$ = $2;" ], [ "?( statement )", "$$ = yy.parameter($2);" ], [ "block_start statements }", "$$ = yy.loc(yy.block([], $2), @$);" ], [ "=> { statements }", "$$ = yy.loc(yy.block([], $3, {redefinesSelf: true}), @$);" ], [ "[ statements_list ]", "$$ = yy.loc(yy.list($2), @$);" ], [ "{ hash_entries }", "$$ = yy.loc(yy.hash($2), @$);" ], [ "float", "$$ = yy.loc(yy.float(parseFloat(yytext)), @$);" ], [ "integer", "$$ = yy.loc(yy.integer(parseInt(yytext)), @$);" ], [ "identifier", "$$ = yy.loc(yy.identifier(yytext), @$);" ], [ "argument", "$$ = yy.loc(yy.variable([yytext.substring(1)]), @$);" ], [ "self_argument", "$$ = yy.loc(yy.fieldReference(yy.variable(['self']), [yytext.substring(2)]), @$);" ], [ "parameter", "$$ = yy.loc(yy.parameter(yy.variable([yytext.substring(1)])), @$);" ], [ "string", "$$ = yy.loc(yy.string(yy.normaliseString(yytext)), @$);" ], [ "interpolated_string", "$$ = yy.loc($1, @$);" ], [ "...", "$$ = yy.loc(yy.splat(), @$);" ] ],
            block_start: [ [ "@ {", "$$ = '@{'" ], [ "@{", "$$ = '@{'" ] ],
            operator: [ [ "raw_operator", "$$ = yy.normaliseOperator(yytext);" ] ],
            unary_operator: [ [ "operator", "$$ = $1;" ], [ "!", "$$ = $1;" ] ],
            interpolated_terminal: [ [ "( statement )", "$$ = $2;" ], [ "identifier", "$$ = yy.variable([$1]);" ] ],
            interpolated_string: [ [ "start_interpolated_string interpolated_string_components end_interpolated_string", "$$ = yy.interpolatedString($2);" ], [ "start_interpolated_string end_interpolated_string", "$$ = yy.interpolatedString([]);" ] ],
            interpolated_string_components: [ [ "interpolated_string_components interpolated_string_component", "$1.push($2); $$ = $1;" ], [ "interpolated_string_component", "$$ = [$1];" ] ],
            interpolated_string_component: [ [ "interpolated_string_terminal_start interpolated_terminal", "$$ = $2;" ], [ "interpolated_string_body", "$$ = yy.string($1);" ], [ "escaped_interpolated_string_body", "$$ = yy.string(yy.normaliseInterpolatedString($1.substring(1)));" ], [ "escaped_escape_interpolated_string_body", "$$ = yy.string($1.substring(3));" ] ]
        }
    };
    exports.parser = parser = createParserWithGrammar(grammar);
    parser.yy = terms;
    exports.parse = function(source) {
        var self;
        self = this;
        return parser.parse(source);
    };
})();