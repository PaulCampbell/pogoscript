script = require './scriptAssertions'

should output = script.should output

describe 'methods'
    describe 'preserving self'
        context 'when a block is called within a method'
            it 'uses the same self as the method'
                'block (b) = b ()
                 
                 o = {
                     name = "name"

                     my method () =
                         block
                             print (self.name)
                 }

                 o.my method ()' should output "'name'"
