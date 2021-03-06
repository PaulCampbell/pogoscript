UniqueNames () = =>
    unique = 0
  
    self.generate name (name) =
        unique := unique + 1
        'gen' + unique + '_' + name

    nil

Symbol Scope = exports.Symbol Scope (parent scope, unique names: new (UniqueNames)) = =>
    variables = {}

    self.define (name) =
        variables.(name) = true
  
    self.generate variable (name) =
        unique names.generate name (name)
  
    self.is defined (name) =
        variables.has own property (name) || (parent scope && parent scope.is defined (name))
  
    self.sub scope () =
        new (Symbol Scope (self, unique names: unique names))

    nil
