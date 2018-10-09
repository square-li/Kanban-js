"use strict";
const submitRequests = require('../submit_requests');
const pathnames = require('../../pathnames');

const ids = require('../ids_dom_elements');
const jsonToHtml = require('../json_to_html');
var JSONTransformer = jsonToHtml.JSONTransformer;
//const Block = require('../bitcoinjs_src/block');
const globals = require('../globals');
const kanbanGO = require('../../external_connections/kanbango/rpc');
const kanbanGOFrontendInitializer = require('./initialization');
const miscellaneousBackend = require('../../miscellaneous');
const miscellaneousFrontEnd = require('../miscellaneous_frontend');

function PendingCall () {
  /** @type {number} */
  this.id = - 1;
  /** @type {number} */
  this.numberReceived = 0;
  /** @type {number} */
  this.totalCalls = 0;
  /** @type {Object} */
  this.nodeCalls = {};
  /** @type {KanbanGoNodes} */
  this.owner = null;
  /** @type {string} */
  this.functionLabel = "";
  /** @type {bool} */
  this.flagShowClearButton = false;
}

function KanbanGoNodes() {
  var inputSchnorr = ids.defaults.kanbanGO.inputSchnorr;
  var inputAggregate = ids.defaults.kanbanGO.inputAggregateSignature;
  var inputSendReceive = ids.defaults.kanbanGO.inputSendReceive;
  /** @type {number}*/
  this.numberOfCalls = 0;
  /** @type {PendingCall[]}*/
  this.pendingCalls = {};

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

  /**@type {Object.<string, rpcCall: string, output: string, outputOptions: Object, inputs: Object>} */
  this.theFunctions  = {
    peerView: {
      // if rpcCall omitted it will be assumed to be equal to the function label.
      rpcCall: kanbanGO.rpcCalls.peerView.rpcCall,
      output: ids.defaults.kanbanGO.outputSendReceive,
      // This will transform some entries of the output json to buttons.
      // If outputOptions are omitted or set to null, 
      // optionsKanbanGOStandard will be used.
      // If the empty object {} is given, no transformations will be carried out.
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
    if (currentCall.rpcCall === null || currentCall.rpcCall === undefined) {
      currentCall.rpcCall = label; 
      if (label !== kanbanGO.rpcCalls[label].rpcCall) {
        throw(`Fatal error: kanbanGO rpc label ${label} doesn't equal the expected value ${kanbanGO.rpcCalls[label].rpcCall}.`);
      }
    }
  }
}

KanbanGoNodes.prototype.updateFields = function(parsedInput, outputs) {
  if (parsedInput === undefined) {
    return;
  }
  for (var label in outputs) {
    if (typeof outputs[label] === "string") {
      submitRequests.updateValue(outputs[label], parsedInput[label]);
    } else {
      this.updateFields(parsedInput[label], outputs[label]);
    }
  }
}

KanbanGoNodes.prototype.callbackStandard = function(/**@type {PendingCall} */ pendingCall, nodeId, input, output) {
  //console.log(`DEBUG: pendingCall id: ${pendingCall.id}, nodeId: ${nodeId}, input: ${input}`);
  pendingCall.nodeCalls[nodeId].result = input;
  pendingCall.numberReceived ++;
  if (pendingCall.numberReceived < pendingCall.totalCalls) {
    //console.log("DEBUG: Received some");
    return;
  }
  var resultHTML = "";
  pendingCall.flagShowClearButton = true;
  var theJSONWriter = new JSONTransformer();
  for (var currentNodeId in pendingCall.nodeCalls) {
    resultHTML += this.callbackStandardOneCaller(pendingCall, pendingCall.nodeCalls[currentNodeId].result, theJSONWriter);
    pendingCall.flagShowClearButton = false;
  }
  if (typeof output === "string") {
    output = document.getElementById(output);
  }
  output.innerHTML = resultHTML;
  theJSONWriter.bindButtons();
  delete this.pendingCalls[pendingCall.id];
}

KanbanGoNodes.prototype.callbackStandardOneCaller = function(
  /**@type {PendingCall} */ 
  pendingCall, 
  input, 
  /**@type {JSONTransformer} */ 
  theJSONWriter
) {
  var options = null;
  var currentFunction = this.theFunctions[pendingCall.functionLabel];
  if (currentFunction.outputOptions !== null && currentFunction.outputOptions !== undefined) {
    options = Object.assign({}, currentFunction.outputOptions);
  } else {
    options = Object.assign({}, this.optionsKanbanGOStandard);
  }

  if (!pendingCall.flagShowClearButton) {
    options.flagDontShowClearButton = true;
  }

  var resultHTML = theJSONWriter.getHtmlFromArrayOfObjects(input, options);
  var theFunction = this.theFunctions[pendingCall.functionLabel];
  var header = "";
  try {
    var parsedInput = JSON.parse(input);
    if (parsedInput.resultHTML !== null && parsedInput.resultHTML !== undefined) {
      header += parsedInput.resultHTML + "<br>"; 
    }
    if (parsedInput.error !== null && parsedInput.error !== undefined) {
      header += `<b>Error:</b> <span style='color:red'>${parsedInput.error}</span><br>`;
    }
    if (parsedInput.reason !== null && parsedInput.reason !== undefined) {
      header += parsedInput.reason + "<br>";
    }
    if (theFunction.outputs !== null && theFunction.outputs !== undefined) {
      this.updateFields(parsedInput, theFunction.outputs);
    }
  } catch (e) {
    header = `<b>Error:</b> ${e}<br>`;
  }
  resultHTML = header + resultHTML;
  return resultHTML;
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

KanbanGoNodes.prototype.run = function(functionLabel) {
  var initializer = kanbanGOFrontendInitializer.initializer;
  var currentId = initializer.selectedNode;
  this.numberOfCalls ++;
  var currentPendingCall = new PendingCall();
  if (currentId !== "all") {
    currentPendingCall.nodeCalls[currentId] = {result: null};
  } else {
    for (var i = 0; i < initializer.nodes.length; i ++) {
      currentPendingCall.nodeCalls[initializer.nodes[i].idBackend] = {result: null};
    }
  }
  currentPendingCall.id = this.numberOfCalls;
  currentPendingCall.owner = this;
  this.pendingCalls[this.numberOfCalls] = currentPendingCall;
  currentPendingCall.run(functionLabel);
}

PendingCall.prototype.run = function (functionLabel) {
  this.functionLabel = functionLabel;
  for (var currentId in this.nodeCalls) {
    this.runOneId(currentId);
  }
}

PendingCall.prototype.runOneId = function (nodeId) {
  var theFunction = this.owner.theFunctions[this.functionLabel];
  if (theFunction === null || theFunction === undefined) {
    throw (`Unknown function call label: ${this.functionLabel}`);
  }
  var theArguments = {};
  var currentInputs = theFunction.inputs;
  for (var inputLabel in currentInputs) {
    theArguments[inputLabel] = document.getElementById(currentInputs[inputLabel]).value;
  }
  var currentInputsBase64 = theFunction.inputsBase64;
  if (currentInputsBase64 !== null && currentInputsBase64 !== undefined) {
    for (var inputLabel in currentInputsBase64) {
      var theValue =  document.getElementById(currentInputsBase64[inputLabel]).value;
      theArguments[inputLabel] = Buffer.from(theValue).toString('base64');
    }
  }
  var messageBody = kanbanGO.getPOSTBodyFromKanbanGORPCLabel(theFunction.rpcCall, theArguments);
  var nodeObject = {
    id: nodeId
  };
  messageBody += `&node=${escape(JSON.stringify(nodeObject))}`;

  var theURL = `${pathnames.url.known.kanbanGO.rpc}`;
  var currentResult = ids.defaults.kanbanGO.outputKBGOTest;
  if (theFunction.output !== undefined && theFunction.output !== null) {
    currentResult = theFunction.output;
  }
  var currentProgress = globals.spanProgress();
  var usePOST = window.kanban.rpc.forceRPCPOST;
  if (!usePOST) {
    if (messageBody.length > 1000) {
      usePOST = true;
    }
  }
  var callbackCurrent = this.owner.callbackStandard;
  if (theFunction.callback !== undefined && theFunction.callback !== null) {
    callbackCurrent = theFunction.callback;
  }  
  callbackCurrent = callbackCurrent.bind(this.owner, this, nodeId);
  if (usePOST) {
    submitRequests.submitPOST({
      url: theURL,
      messageBody: messageBody,
      progress: currentProgress,
      callback: callbackCurrent,
      result: currentResult
    });
  } else {
    theURL += `?command=${messageBody}`;
    submitRequests.submitGET({
      url: theURL,
      progress: currentProgress,
      callback: callbackCurrent,
      result: currentResult
    });
  }
}

var testFunctions = new KanbanGoNodes();

module.exports = {
  testFunctions
}