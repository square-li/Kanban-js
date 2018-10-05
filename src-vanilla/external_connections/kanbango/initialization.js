"use strict";

var rpcCalls = {
  runNodes: {
    rpcCall: "runNodes",
    mandatoryFixedArguments: { //<- values give defaults, null for none
    },
    mandatoryModifiableArguments: { //<- values give defaults, null for none
      numberOfNodes: null
    },
  },
  getNodeInformation: {
    rpcCall: "getNodeInformation",
    mandatoryFixedArguments: { //<- values give defaults, null for none
    },
    mandatoryModifiableArguments: { //<- values give defaults, null for none
    },
    optionalModifiableArguments: {
    },
    allowedArgumentValues: {
    }
  }
};

module.exports = {
  rpcCalls
}
