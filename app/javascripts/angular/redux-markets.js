
angular.module('predictionMarketApp')
.factory('marketCreationActions', () => ({
  reqNewMarket: (pmArgs) => ({ type: 'REQ_NEW_MARKET', pmArgs }),
  reqPublish: (marketAddress) => ({ type: 'REQ_PUBLISH', marketAddress }),
  chgMarketCreationArgs: (args) => ({ type: 'CHG_MARKET_CREATION_ARGS', args }),
}))
.factory('marketsListActions', () => ({
  reqRefreshMarkets: () => ({ type: 'REQ_REFRESH_MARKETS' }),
  reqRefreshMarket: (marketAddress) => ({ type: 'REQ_REFRESH_MARKET', marketAddress}),
}))

.factory('marketCreationReducer', function () {
  const defaultState = {
    created: null,
    question: '',
    expirationTime: Math.floor(Date.now() / 1000) + 60,
    responder: web3.eth.coinbase,
    feeRate: 100,
    initialPrize: 1000000000000000000,
  }
  return function (state = defaultState, action) {
    switch (action.type) {
      case 'CHG_MARKET_CREATION_ARGS':
        let args = action.args
        return Object.assign({}, state, {
          question: args.question,
          expirationTime: args.expirationTime,
          responder: args.responder,
          feeRate: args.feeRate,
          initialPrize: args.initialPrize,
        })
      case 'SET_MARKET_CREATED':
        return Object.assign({}, state, {
          created: action.address,
        })
      default:
        return state
    }
  }
})
.factory('marketsReducer', function () {
  const defaultState = {
    availMrktAddrs: [],
    marketsDetails: { /* '<address>': { ... } */ },
  }
  return function (state = defaultState, action) {
    switch (action.type) {
      case 'SET_MARKETS':
        let details = action.details || state.marketsDetails || {}
        let list = action.list || (action.details && Object.keys(action.details))
        return Object.assign({}, state, {
          availMrktAddrs: list,
          marketsDetails: details,
        })
      case 'SET_MARKET_DETAILS':
        return Object.assign({}, state, {
          marketsDetails: Object.assign({}, state.marketsDetails, {
            [action.marketDetails.address]: action.marketDetails
          })
        })
      default:
        return state
    }
  }
})

.factory('sagaMarkets', function ($rootScope, $log, predictionMarketService) {
  let effects = ReduxSaga.effects
  let getSelectedAccount = state => state.selectedAccount
  let marketsIndex = PredictionMarketsIndex.deployed()
  return function* () {
    yield [
      ReduxSaga.takeLatest('REQ_NEW_MARKET', reqNewMarket),
      ReduxSaga.takeEvery('REQ_PUBLISH', reqPublish),
      ReduxSaga.takeLatest('REQ_REFRESH_MARKETS', retrieveMarkets),
      ReduxSaga.takeEvery('REQ_REFRESH_MARKET', reqRefreshMarket),
    ]
  }

  function* reqNewMarket(action) {
    try {
      let from = yield effects.select(getSelectedAccount)
      let args = action.pmArgs

      if(!from.address) throw new Error('Missing selected account for the operation')
      if(!args.question) throw new Error('Missing question')
      if(!args.expirationTime) throw new Error('Invalid expirationTime')
      if(!args.responder) throw new Error('Missing responder address')
      if(!args.initialPrize) throw new Error('Missing initial prize')

      let {txid, getContractAddress} = yield effects.call(predictionMarketService.deployContract,
        PredictionMarket,
        args.question, args.expirationTime, args.responder, args.feeRate,
        {from: from.address, value: args.initialPrize, gas: from.gasLimit})
      let transaction = yield effects.cps(web3.eth.getTransaction, txid)
      yield effects.put({type: 'SET_BROADCASTED_TXID', txid, transaction})
      let address = yield getContractAddress
      $log.info('New PredictionMarket at address:', address)
      yield [
        effects.put({type: 'SET_MINED_TXID', txid}),
        effects.put({type: 'SET_MARKET_CREATED', address}),
      ]
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_NEW_MARKET', error})
    }
  }

  function* reqPublish(action) {
    try {
      let from = yield effects.select(getSelectedAccount)

      if(!from.address) throw new Error('Missing selected account for the operation')
      if(!action.marketAddress) throw new Error('Missing market address')

      let addMarket = marketsIndex.addMarket
      let callArgs = [action.marketAddress, { from: from.address, gas: 150000}]
      let simulationRes = yield effects.call([addMarket, addMarket.call], ...callArgs)
      let estimatedGas = yield effects.cps(marketsIndex.contract.addMarket.estimateGas, ...callArgs)
      $log.debug('addMarket simulation result:', simulationRes, '- estimated gas:', estimatedGas)
      if (simulationRes === false)
        throw new Error( 'Publish error, failed call simulation')
      let txid = yield effects.call([addMarket, addMarket.sendTransaction], ...callArgs)
      let transaction = yield effects.cps(web3.eth.getTransaction, txid)
      $log.info('MarketsIndex.addMarket() txid:', txid)
      yield effects.put({type: 'SET_BROADCASTED_TXID', txid, transaction})
      let receipt = yield effects.call(predictionMarketService.transactionReceiptMined, txid)
      yield effects.put({type: 'SET_MINED_TXID', txid, receipt})
      if (receipt.gasUsed === transaction.gas)
        throw new Error('Out of gas')
      yield effects.put({type: 'SET_MARKET_CREATED', address: null}),
      yield* retrieveMarkets()
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_PUBLISH', error})
    }
  }

  function* retrieveMarkets() {
    let list = yield fetchMarketsList()
    yield effects.put({type: 'SET_MARKETS', list})
    // let details = yield fetchMarketsDetails(list)
    // yield effects.put({type: 'SET_MARKETS', list, details})
    yield* updateMarketsDetails(list)
  }

  function* reqRefreshMarket(action) {
    let marketDetails = yield loadMarketData(action.marketAddress)
    yield effects.put({type: 'SET_MARKET_DETAILS', marketDetails})
  }

  function* fetchMarketsList() {
    let addrs = yield marketsIndex.getAvailableMarketsRawArray.call()
    var markets = []
    for (var i=0; i < addrs.length; i++) {
      if (addrs[i] != 0)
        markets.push(addrs[i])
    }
    // yield markets
    return markets
  }

  function arrayToMap(a, f) {
    return a.reduce((map,  obj) => {
      map[obj[f]] = obj
      return map
    }, {})
  }

  function* fetchMarketsDetails(addressList) {
    let list = yield addressList.map(addr => loadMarketData(addr))
    let map = arrayToMap(list, 'address')
    $rootScope.$emit('market-list-updated')  //TODO: remove
    return map
  }

  function* updateMarketsDetails(addressList) {
    function* doPage(list) {
      try {
        let details = yield list.map(addr => loadMarketData(addr))
        for (let marketDetails of details)
          yield effects.put({type: 'SET_MARKET_DETAILS', marketDetails})
      } catch (error) {
        $log.error(error)
        yield effects.put({type: 'ERR_INTERNAL', error})
      }
    }
    let pageSize = 3
    let page = []
    for (let addr of addressList) {
      page.push(addr)
      if (page.length == pageSize) {
        yield* doPage(page)
        page = []
      }
    }
    if (page.length > 0) yield* doPage(page)
    $rootScope.$emit('market-list-updated')  //TODO: remove
  }

  function secure(obj, method, ...args) {
    return new Promise(function(resolve, reject) {
      try {
        obj[method](...args).then(resolve).catch(reject)
      } catch (error) {
        reject(error)
      }
    })
  }

  function secure2(obj, method, ...args) {
    return new Promise(function(resolve, reject) {
      try {
        obj[method](...args, function(e,v) {
          if (e) reject(e)
          else resolve(v)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  function* fetchContractData(contract, fields) {
    // let values = yield fields.map(f => effects.call([contract[f], contract[f].call]))
    try {
      // let calls = fields.map(f => contract[f].call())
      // let values = yield calls
      // use original web3 function for a bug on ether-pudding with a contract initialized with a wrong address
      contract = contract.contract
      data = {}
      for (let i=0; i<fields.length; i++) {
        let f = fields[i]
        // data[f] = yield effects.cps([contract[f], contract[f].call])
        // data[f] = yield contract[f].call()
        // data[f] = yield secure2((cb)=>contract[f].call(cb))
        // data[f] = yield secure2(contract[f], 'call')
        contract[f].call((e,v) => {
          console.log(e,v)
        })
      }
      // values.forEach((v,i) => {
        // data[fields[i]] = v
      // })
      return data
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_INTERNAL', error})
    }
  }



  // function* fetchContractData(contract, fields) {
  //   try {
  //     // use secure() for a bug on web3 with a contract initialized with a wrong address
  //     // let values = yield fields.map(f => effects.call([contract[f], contract[f].call]))
  //     let values = yield fields.map(f => secure(()=>contract[f].call()))
  //     data = {}
  //     values.forEach((v,i) => {
  //       data[fields[i]] = v
  //     })
  //     return data
  //   } catch (error) {
  //     $log.error(error)
  //     yield effects.put({type: 'ERR_INTERNAL', error})
  //   }
  // }

  function* loadMarketData(address) {
    try {
      if (!address) throw new Error('Missing market address')
      var marketData = { address }
      let data = yield fetchContractData(PredictionMarket.at(address), [
        'question',
        'expiration',
        'responder',
        'owner',
        'yes',
        'no',
        'payout',
        'feeRate',
        'getYesPrice',
        'getNoPrice',
        'prizePool',
        'totalFees',
        'getVerdict',
      ])
      Object.assign(marketData, data)
      let supply = yield [
        AnswerToken.at(marketData.yes).totalSupply.call(),
        AnswerToken.at(marketData.no).totalSupply.call(),
      ]
      Object.assign(marketData, {
        yesTotalBids: supply[0],
        noTotalBids: supply[1],
      })
      return marketData
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_INTERNAL', error})
    }
  }


})
