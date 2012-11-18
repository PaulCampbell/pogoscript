var cg = require('../codeGenerator');

exports.codeGenerator = function () {
  var codegen = {};

  var term = require('../terms')(codegen);

  var importTerm = function (name) {
    codegen[name] = require('../' + name)(codegen);
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
  importTerm('unaryOperatorExpression');
  importTerm('operator');
  importTerm('splat');
  importTerm('hashEntry');
  codegen.concatName = cg.concatName;
  codegen.parseSplatParameters = cg.parseSplatParameters;
  codegen.collapse = cg.collapse;
  importTerm('functionCall');
  importTerm('scope');
  codegen.SymbolScope = require('../symbolScope').SymbolScope;
  importTerm('macroDirectory');
  importTerm('boolean');
  importTerm('increment');
  codegen.typeof = require('../typeof').typeof;
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
  codegen.callbackFunction = codegen.generatedVariable(['callback']);
  codegen.optional = cg.optional;
  codegen.postIncrement = cg.postIncrement;
  codegen.oldTerm = cg.oldTerm;
  importTerm('semanticError');
  codegen.errors = require('./errors').errors(codegen);
  codegen.macros = require('./macros').macros(codegen);
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