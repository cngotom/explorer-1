#!/usr/bin/env node

/*
    Endpoint for client to talk to etc node
*/

var Conf = require("../config").Conf
var Web3 = require("web3");
var web3;

var BigNumber = require('bignumber.js');
var etherUnits = require(__lib + "etherUnits.js")

var getLatestBlocks = require('./index').getLatestBlocks;
var filterBlocks = require('./filters').filterBlocks;
var filterTrace = require('./filters').filterTrace;
var DB = require("../db.js")
var Transaction = DB.Transaction

var async = require("async")

if (typeof web3 !== "undefined") {
  web3 = new Web3(web3.currentProvider);
} else {
  web3 = new Web3(new Web3.providers.HttpProvider(Conf.Web3Provider));
}

if (web3.isConnected()) 
  console.log("Web3 connection established");
else
  throw "No connection";

console.log(web3)

var newBlocks = web3.eth.filter("latest");
var newTxs = web3.eth.filter("pending");

exports.data = function(req, res){
  console.log(req.body)

  if ("tx" in req.body) {
    var txHash = req.body.tx.toLowerCase();

    web3.eth.getTransaction(txHash, function(err, tx) {
      if(err || !tx) {
        console.error("TxWeb3 error :" + err)
        if (!tx) {
          web3.eth.getBlock(txHash, function(err, block) {
            if(err || !block) {
              console.error("BlockWeb3 error :" + err)
              res.write(JSON.stringify({"error": true}));
            } else {
              console.log("BlockWeb3 found: " + txHash)
              res.write(JSON.stringify({"error": true, "isBlock": true}));
            }
            res.end();
          });
        } else {
          res.write(JSON.stringify({"error": true}));
          res.end();
        }
      } else {
        var ttx = tx;
        ttx.value = etherUnits.toEther( new BigNumber(tx.value), "wei");
        //get timestamp from block
        var block = web3.eth.getBlock(tx.blockNumber, function(err, block) {
          if (!err && block)
            ttx.timestamp = block.timestamp;
          ttx.isTrace = (ttx.input != "0x");
          res.write(JSON.stringify(ttx));
          res.end();
        });
      }
    });

  } else if ("tx_trace" in req.body) {
    var txHash = req.body.tx_trace.toLowerCase();

    web3.trace.transaction(txHash, function(err, tx) {
      if(err || !tx) {
        console.error("TraceWeb3 error :" + err)
        res.write(JSON.stringify({"error": true}));
      } else {
        res.write(JSON.stringify(filterTrace(tx)));
      }
      res.end();
    });
  } else if ("addr_trace" in req.body) {
    var addr = req.body.addr_trace.toLowerCase();
    // need to filter both to and from
    // from block to end block, paging "toAddress":[addr], 
    // start from creation block to speed things up 
    // TODO: store creation block
    var filter = {"fromBlock":"0x1d4c00", "toAddress":[addr]};
    web3.trace.filter(filter, function(err, tx) {
      if(err || !tx) {
        console.error("TraceWeb3 error :" + err)
        res.write(JSON.stringify({"error": true}));
      } else {
        res.write(JSON.stringify(filterTrace(tx)));
      }
      res.end();
    }) 
  } else if ("addr" in req.body) {
    var addr = req.body.addr.toLowerCase();
    var options = req.body.options;

    var addrData = {};

    async.parallel([

      (finish) =>{
        if (options.indexOf("balance") > -1) {
          web3.eth.getBalance(addr,(err,balance)=>{
            if(!err){
              addrData["balance"] =  balance
              addrData["balance"] = etherUnits.toEther(addrData["balance"], 'wei');
            }else{
              console.error("AddrWeb3 error :" + err);
               addrData = {"error": true};
            }
            finish()
          });  
        }
      },
      (finish) =>{
        if (options.indexOf("count") > -1) {
          var addrFind = Transaction.find( { $or: [{"to": addr}, {"from": addr}] })  
          addrFind.count(function (err, cnt) {
            if(!err){
              addrData["count"] = cnt
            }else{
              addrData = {"error": true};
            }
            finish()
          })
        }
      },
      (finish) =>{
        if (options.indexOf("bytecode") > -1) {
          try {
             addrData["bytecode"] = web3.eth.getCode(addr);
             if (addrData["bytecode"].length > 2) 
                addrData["isContract"] = true;
             else
                addrData["isContract"] = false;
          } catch (err) {
            console.error("AddrWeb3 error :" + err);
            addrData = {"error": true};
          }
          finish()
        }
      }

    ],(err,reslut)=> {
      res.write(JSON.stringify(addrData));
      res.end();
    })
   


  } else if ("block" in req.body) {
    var blockNumOrHash;
    if (/^(0x)?[0-9a-f]{64}$/i.test(req.body.block.trim())) {
        blockNumOrHash = req.body.block.toLowerCase();
    } else {
        blockNumOrHash = parseInt(req.body.block);
    }

    web3.eth.getBlock(blockNumOrHash, function(err, block) {
      if(err || !block) {
        console.error("BlockWeb3 error :" + err)
        res.write(JSON.stringify({"error": true}));
      } else {
        res.write(JSON.stringify(filterBlocks(block)));
      }
      res.end();
    });

  } else {
    console.error("Invalid Request: " + action)
    res.status(400).send();
  }

};

exports.eth = web3.eth;
  
