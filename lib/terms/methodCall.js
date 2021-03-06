(function() {
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