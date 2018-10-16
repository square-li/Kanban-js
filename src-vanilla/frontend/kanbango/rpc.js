"use strict";
const submitRequests = require('../submit_requests');
const pathnames = require('../../pathnames');

const ids = require('../ids_dom_elements');
//const Block = require('../bitcoinjs_src/block');
const kanbanGO = require('../../external_connections/kanbango/rpc');
const kanbanGOInitialization = require('../../external_connections/kanbango/initialization');
const miscellaneousBackend = require('../../miscellaneous');
const miscellaneousFrontEnd = require('../miscellaneous_frontend');
const PendingCall = require('./pending_calls').PendingCall;
const KanbanGONode = require('./pending_calls').KanbanGONode;

function KanbanGoNodes() {
  var inputSchnorr = ids.defaults.kanbanGO.inputSchnorr;
  var inputAggregate = ids.defaults.kanbanGO.inputAggregateSignature;
  var inputSendReceive = ids.defaults.kanbanGO.inputSendReceive;
  var inputInitialization = ids.defaults.kanbanGO.inputInitialization;
  /** @type {number}*/
  this.numberOfCalls = 0;
  /** @type {PendingCall[]}*/
  this.pendingCalls = {};
  /**@type {KanbanGONode[]} */
  this.nodes = [];
  /**@type {string} */
  this.selectedNode = "";
  
  this.transformersStandard = {
    shortener: {
      transformer: miscellaneousBackend.hexShortenerForDisplay
    },
    veryShort: {
      transformer: miscellaneousBackend.hexVeryShortDisplay
    },
    blockHash: {
      clickHandler: this.getBlockByHash.bind(this),
      transformer: miscellaneousBackend.hexShortenerForDisplay
    },
  }
  // Specifies options for rpc kanban rpc output display.
  this.optionsKanbanGOStandard = {
    // Suppose we are displaying a nested JSON.
    // The list below specifies how to transform the value of 
    // each [modified selector key], value
    // pair nested within the JSON. 
    //
    // To define the [modified selector key], we first define the 
    // [selector key].
    //
    // For a simple object such as {a: 1, b: "x"}, 
    // the [selector key] is the same as the object key, i.e., 
    // the [selector key]'s in the object above are "a", "b".
    // For a nested object sich as {a: {b: 1, c: 2}, d: "x", q: ["z", {e: "w"} ] },
    // the [selector key]'s are obtained by concatenating 
    // the labels recursively using a dot separator.
    // Here, each array is interpreted as an object
    // with a single key given by the string "${number}".
    // Rather than giving a fixed spec, we 
    // illustrate the whole procedure on an example. 
    // In the example {a: {b: 1, c: 2}, d: "x", q: ["z", {e: "w"} ] } above, 
    // there are 8 [sel. key], value pairs:
    // 
    // 1. [sel. key] = "a"     [value] = {b: 1, c: 2}
    // 2. [sel. key] = "a.b"   [value] = 1
    // 3. [sel. key] = "a.c"   [value] = 2
    // 4. [sel. key] = "d"     [value] = "x"
    // 5. [sel. key] = "q"     [value] = ["z", {e: "w"}]
    // 6. [sel. key] = "q.1"   [value] = "z"
    // 7. [sel. key] = "q.2"   [value] = {e: "w"}
    // 8. [sel. key] = "q.2.e" [value] = "w"
    //
    // Finally, we modify each selector key by replacing 
    // each number by the string  "${number}". 
    // In this way, the [selector key]s "q.1" and "q.2" are 
    // both replaced by "q.${number}" and "q.${number}".
    //
    // Please not that the modified selector keys do not distinguish between
    // array members with different indices.
    //
    // As an aside note, please note that if the keys of a json object contain dots, then
    // the modified selectors may end up selecting more than one label combination.
    // 
    transformers: {
      address: this.transformersStandard.shortener,
      publicKey: this.transformersStandard.shortener,
      payload: this.transformersStandard.shortener,
      logsBloom: this.transformersStandard.veryShort,
      hash: this.transformersStandard.blockHash,
      miner: this.transformersStandard.shortener,
      mixHash: this.transformersStandard.veryShort,
      hashNoSignature: this.transformersStandard.shortener,
      parentHash: this.transformersStandard.blockHash,
      receiptsRoot: this.transformersStandard.veryShort,
      sha3Uncles: this.transformersStandard.shortener,
      signature: this.transformersStandard.shortener,
      nonce: this.transformersStandard.veryShort,
      stateRoot: this.transformersStandard.shortener,
      transactionsRoot: this.transformersStandard.shortener,
      "messages": this.transformersStandard.veryShort,
      "messages.received.${number}.payload": this.transformersStandard.shortener,
      "messages.received.${number}.from": this.transformersStandard.shortener,
      "messages.received.${number}.to": this.transformersStandard.shortener,
      "messages.sent.${number}.payload": this.transformersStandard.shortener,
      "messages.sent.${number}.from": this.transformersStandard.shortener,
      "messages.sent.${number}.to": this.transformersStandard.shortener,
      proposerAddress: this.transformersStandard.shortener,
      "view.blockHash": this.transformersStandard.shortener,
      "${any}.address": this.transformersStandard.shortener,
      "peerViews.${label}": this.transformersStandard.shortener,
      "peerViews.${any}.Digest": this.transformersStandard.shortener,
      "smallestMajorityView.Digest": this.transformersStandard.shortener,
      privateKeyBase58: this.transformersStandard.shortener,
      privateKeyBase58Check: this.transformersStandard.shortener,
      privateKeyBase64: this.transformersStandard.shortener,
      privateKeyHex: this.transformersStandard.shortener,
    }
  };
  this.optionsKanbanGOLabelContraction = {};
  this.optionsKanbanGOLabelContraction.transformers = Object.assign({}, this.optionsKanbanGOStandard.transformers);
  this.optionsKanbanGOLabelContraction.transformers["${label}"] = this.transformersStandard.shortener;

  this.callTypes = {
    standard: {
      json: this.optionsKanbanGOStandard,
      idDefaultOutput: ids.defaults.kanbanGO.outputSendReceive,
      rpcCalls: kanbanGO.rpcCalls,
      url: pathnames.url.known.kanbanGO.rpc,
    },
    test: {
      json: this.optionsKanbanGOStandard,
      idDefaultOutput: ids.defaults.kanbanGO.outputKBGOTest,
      rpcCalls: kanbanGO.rpcCalls,
      url: pathnames.url.known.kanbanGO.rpc,
    },
    initialization: {
      json: {
      },
      rpcCalls: kanbanGOInitialization.rpcCalls,
      idDefaultOutput: ids.defaults.kanbanGO.outputKanbanInitialization,
      url: pathnames.url.known.kanbanGO.initialization,
    }
  }; 
  // if rpcCall omitted it will be assumed to be equal to the function label.
  /**@type {Object.<string, rpcCall: string, output: string, outputOptions: Object, inputs: Object>} */
  this.theFunctions  = {
    runNodes: {
      inputs: {
        numberOfNodes: inputInitialization.numberOfNodes
      }
    },
    getNodeInformation: {
      callback: this.getNodeInformationCallback
    },
    peerView: {
      output: ids.defaults.kanbanGO.outputSendReceive,
      outputOptions: this.optionsKanbanGOStandard
    },
    roundChangeRequests: {
      // if rpcCall omitted it will be assumed to be equal to the function label.
      rpcCall: kanbanGO.rpcCalls.roundChangeRequests.rpcCall,
      output: ids.defaults.kanbanGO.outputSendReceive,
      // This will transform some entries of the output json to buttons.
      // If outputOptions are omitted or set to null, 
      // optionsKanbanGOStandard will be used.
      // If the empty object {} is given, no transformations will be carried out.
      outputOptions: this.optionsKanbanGOStandard
    },
    getBlockByHash: {
      inputs: {
        blockHash: inputSendReceive.blockHash
      },
      outputs: {
        number: inputSendReceive.blockNumber
      },
      output: ids.defaults.kanbanGO.outputSendReceive
    },
    compileSolidity: {
      inputs: {
        solidityInput: ids.defaults.kanbanGO.inputSendReceive.solidityInput
      },
      output: ids.defaults.kanbanGO.outputSendReceive      
    },
    getBlockByNumber: {
      inputs: {
        blockNumber: inputSendReceive.blockNumber
      },
      outputs: {
        hash: inputSendReceive.blockHash        
      },
      output: ids.defaults.kanbanGO.outputSendReceive
    },
    round: {
      output: ids.defaults.kanbanGO.outputSendReceive
    },
    validators: {
      output: ids.defaults.kanbanGO.outputSendReceive,
      outputOptions: this.optionsKanbanGOLabelContraction
    },
    testSha3 : {
      //if rpcCall omitted it will be assumed to be equal to the function label.
      rpcCall: kanbanGO.rpcCalls.testSha3.rpcCall, 
      inputs: {
        message: inputSchnorr.message
      }
    },
    versionGO: {
    },
    testPrivateKeyGeneration: {
      outputs: {
        privateKeyBase58Check: inputSchnorr.privateKey
      }
    },
    testPublicKeyFromPrivate: {
      inputs: {
        privateKey: inputSchnorr.privateKey
      },
      outputs: {
        publicKeyHex: inputSchnorr.publicKey
      }
    },
    testSchnorrSignature: {
      inputs: {
        privateKey: inputSchnorr.privateKey
      },
      inputsBase64: {
        messageBase64: inputSchnorr.message
      },
      outputs: {
        signatureBase58: inputSchnorr.signature
      }
    },
    testSchnorrVerification: {
      inputs: {
        publicKey: inputSchnorr.publicKey,
        signature: inputSchnorr.signature
      },
      inputsBase64: {
        messageBase64: inputSchnorr.message
      },
      callback: this.callbackStandard
    },
    testAggregateInitialize: {
      inputs: {
        numberOfPrivateKeysToGenerate: inputAggregate.numberOfPrivateKeysToGenerate
      },
      callback: this.callbackAggregateInitialization
    },
    testAggregateCommitment: {
      inputsBase64: {
        messageBase64: inputAggregate.message
      },
      callback: this.callbackAggregateCommitment
    },
    testAggregateChallenge: {
      inputs: {        
        committedSigners: inputAggregate.committedSignersBitmap
      },
      inputsBase64: {
        commitmentsBase64: inputAggregate.commitments,
      },
      outputs: {
        aggregator: {
          aggregateCommitment: inputAggregate.aggregateCommitment,
          aggregatePublicKey: inputAggregate.aggregatePublickey,
          messageDigest: inputAggregate.digest
        }
      }
    },
    testAggregateSolutions: {
      inputs: {
        committedSigners: inputAggregate.committedSignersBitmap,
        digest: inputAggregate.digest,
        aggregateCommitment: inputAggregate.aggregateCommitment,
        aggregatePublicKey: inputAggregate.aggregatePublickey
      },
      callback: this.callbackAggregateSolutions
    },
    testAggregateSignature: {
      inputs: {
        committedSigners: inputAggregate.committedSignersBitmap,
      },
      inputsBase64: {
        solutionsBase64: inputAggregate.solutions,
      },
      outputs: {
        aggregator: {
          signatureNoBitmap: inputAggregate.aggregateSignature
        }
      }
    },
    testAggregateVerification: {
      inputsBase64: {
        messageBase64: inputAggregate.message,
        allPublicKeysBase64: inputAggregate.publicKeys,
      },
      inputs: {
        signature: inputAggregate.aggregateSignature,
        committedSigners: inputAggregate.committedSignersBitmap,
      },
      callback: this.callbackStandard
    },
  };
  this.correctFunctions();
}

KanbanGoNodes.prototype.getBlockByHash = function (container, inputHash) {
  submitRequests.updateValue(ids.defaults.kanbanGO.inputSendReceive.blockHash, inputHash);
  miscellaneousFrontEnd.revealLongWithParent(container, inputHash);
  this.run('getBlockByHash');
}


function getSignerField(input, label) {
  var parsedInput = JSON.parse(input);
  var result = [];
  if (parsedInput.signers === null || parsedInput.signers === undefined) {
    return result;
  }
  for (var i = 0; i < parsedInput.signers.length; i ++) {
    var incoming = parsedInput.signers[i][label];
    if (incoming === "" || incoming === null || incoming === undefined) {
      incoming = "(ignored)";
    }
    result.push(incoming);
  }
  return result;
}

KanbanGoNodes.prototype.callbackAggregateSolutions = function(pendingCall, nodeId, input, output) {
  this.callbackStandard(pendingCall, nodeId, input, output);
  var solutions = getSignerField(input, "mySolution");
  submitRequests.updateValue(ids.defaults.kanbanGO.inputAggregateSignature.solutions, solutions.join(", "));
}

KanbanGoNodes.prototype.callbackAggregateInitialization = function(pendingCall, nodeId, input, output) {
  this.callbackStandard(pendingCall, nodeId, input, output);
  var privateKeys = getSignerField(input, "privateKeyBase58");
  var publicKeys = getSignerField(input, "myPublicKey");
  submitRequests.updateValue(ids.defaults.kanbanGO.inputAggregateSignature.privateKeys, privateKeys.join(", "));
  submitRequests.updateValue(ids.defaults.kanbanGO.inputAggregateSignature.publicKeys, publicKeys.join(", "));
}

KanbanGoNodes.prototype.callbackAggregateCommitment = function(pendingCall, nodeId, input, output) {
  this.callbackStandard(pendingCall, nodeId, input, output);
  var commitments = getSignerField(input, "commitmentHexCompressed");
  var nonces = getSignerField(input, "myNonceBase58");
  submitRequests.updateValue(ids.defaults.kanbanGO.inputAggregateSignature.commitments, commitments.join(", "));
  submitRequests.updateValue(ids.defaults.kanbanGO.inputAggregateSignature.nonces, nonces.join(", "));
}

KanbanGoNodes.prototype.correctFunctions = function() {  
  for (var label in this.theFunctions) {
    var currentCall = this.theFunctions[label];
    var actualLabel = currentCall.rpcCall;
    if (actualLabel === null || actualLabel === undefined) {
      actualLabel = label;
    }
    currentCall.rpcCall = actualLabel; 
    var currentRPCCall = kanbanGO.rpcCalls[label];
    if (currentRPCCall === undefined || currentRPCCall === null) {
      currentRPCCall = kanbanGOInitialization.rpcCalls[label];
    }
    if (currentRPCCall === undefined || currentRPCCall === null) {
      throw(`Fatal error: the kanbanGO rpc label ${label} is not an available rpc call. `);
    }
  }
}

KanbanGoNodes.prototype.testClear = function() {
  var inputAggregate = ids.defaults.kanbanGO.inputAggregateSignature;
  submitRequests.updateValue(inputAggregate.numberOfPrivateKeysToGenerate, '5');
  submitRequests.updateValue(inputAggregate.privateKeys, '');
  submitRequests.updateValue(inputAggregate.nonces, '');
  submitRequests.updateValue(inputAggregate.publicKeys, '');
  submitRequests.updateValue(inputAggregate.committedSignersBitmap, '01111');
  submitRequests.updateValue(inputAggregate.commitments, '');
  submitRequests.updateValue(inputAggregate.digest, '');
  submitRequests.updateValue(inputAggregate.aggregateCommitment, '');
  submitRequests.updateValue(inputAggregate.aggregatePublickey, '');
  submitRequests.updateValue(inputAggregate.solutions, '');
  submitRequests.updateValue(inputAggregate.aggregateSignature, '');
}

KanbanGoNodes.prototype.run = function(functionLabel, callType) {
  if (callType === undefined) {
    callType = "standard";
  }
  if (! (callType in this.callTypes)) {
    throw `Call type not among the allowed call types: ${Object.keys(this.callTypes)}`;
  }
  var currentId = this.selectedNode;
  this.numberOfCalls ++;
  var currentPendingCall = new PendingCall();
  if (currentId !== "all") {
    currentPendingCall.nodeCalls[currentId] = {result: null};
  } else {
    for (var i = 0; i < this.nodes.length; i ++) {
      currentPendingCall.nodeCalls[this.nodes[i].idBackend] = {result: null};
    }
  }
  currentPendingCall.id = this.numberOfCalls;
  currentPendingCall.owner = this;
  currentPendingCall.callType = callType;
  this.pendingCalls[this.numberOfCalls] = currentPendingCall;
  currentPendingCall.run(functionLabel);
}

KanbanGoNodes.prototype.getNodeInformation = function () {
  this.run('getNodeInformation', 'initialization');
}

KanbanGoNodes.prototype.selectRadio = function (idRadio) {
  this.selectedNode = idRadio;
  //console.log(`DEBUG: set this.selectedNode to: ${idRadio} `);
}

KanbanGoNodes.prototype.toHTMLRadioButton = function () {
  var radioButtonHTML = "";
  radioButtonHTML += `<label class = "containerRadioButton">`;
  radioButtonHTML += `<input type = "radio" name = "rpcKanbanGO" id = "kanbanGoNodeSelector_all" `;
  radioButtonHTML += ` onchange = "window.kanban.kanbanGO.rpc.theKBNodes.selectRadio('all')" `; 
  if (this.selectedNode === "all") {
    radioButtonHTML += "checked";
  }
  radioButtonHTML += `>`;
  radioButtonHTML += `<span class = "radioMark"></span>`;
  radioButtonHTML += `all`;
  radioButtonHTML += `</label>`;

  for (var counterNode = 0; counterNode < this.nodes.length; counterNode ++) {
    radioButtonHTML += this.nodes[counterNode].toHTMLRadioButton();
  } 
  return radioButtonHTML;
}

var theKBNodes = new KanbanGoNodes();

module.exports = {
  theKBNodes
}