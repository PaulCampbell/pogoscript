var cg = require('../../lib/codeGenerator');

exports.basicExpression = require('./basicExpression');
exports.variable = cg.variable;
exports.selfExpression = cg.selfExpression;
exports.statements = cg.statements;
exports.block = cg.block;
exports.parameter = cg.parameter;
exports.identifier = cg.identifier;
exports.integer = cg.integer;
exports.float = cg.float;
exports.normaliseString = cg.normaliseString;
exports.string = cg.string;
exports.interpolatedString = cg.interpolatedString;
exports.module = cg.module;
exports.interpolation = cg.interpolation;
exports.list = cg.list;
exports.fieldReference = cg.fieldReference;
exports.hash = cg.hash;
exports.noArgSuffix = cg.noArgSuffix;
exports.complexExpression = require('./complexExpression');
exports.operatorExpression = require('./operatorExpression');
exports.newUnaryOperatorExpression = require('./unaryOperatorExpression').newUnaryOperatorExpression;
exports.operator = cg.operator;
exports.macros = require('./macros');

exports.expression = function (e) {
  return new function () {
    this.expression = function () {
      return e;
    };
  };
};

exports.lexOperator = function (op) {
  if (/^[!?:,.#=]$/.test(op)) {
    return op;
  } else if (op == '=>') {
    return op;
  } else {
    return 'raw_operator';
  }
};

exports.normaliseOperator = function (op) {
  return op.replace('\\\\', '\\');
};

exports.loc = function (term, location) {
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