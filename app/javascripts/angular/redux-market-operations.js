angular.module('predictionMarketApp')
.factory('marketOperationsActions', () => ({
  reqSelectMarket: (marketAddress) => ({ type: 'REQ_SELECT_MARKET', marketAddress }),
  reqRefreshBets: (marketAddress) => ({ type: 'REQ_REFRESH_BETS' }),
  reqBet: (marketAddress, what, value) => ({ type: 'REQ_BET', marketAddress, what, value }),
  reqGiveVerdict: (marketAddress, what) => ({ type: 'REQ_GIVE_VERDICT', marketAddress, what }),
  reqWithdrawFees: (marketAddress) => ({ type: 'REQ_WITHDRAW_FEES', marketAddress }),
  reqWithdrawPrize: (marketAddress) => ({ type: 'REQ_WITHDRAW_PRIZE', marketAddress }),
  reqWithdraw: (marketAddress) => ({ type: 'REQ_WITHDRAW', marketAddress }),
}))

.factory('marketOperationsReducer', function () {
  const defaultState = {
    selectedMarket: null, // address
    yesBets: null,
    noBets: null,
  }
  return function (state = defaultState, action) {
    switch (action.type) {
      case 'SET_SELECTED_MARKET':
        return Object.assign({}, state, {
          selectedMarket: action.marketAddress,
          yesBets: action.yesBets,
          noBets: action.noBets
        })
      default:
        return state
    }
  }
})

.factory('sagaMarketOperations', function ($rootScope, $log, predictionMarketService, marketsListActions) {
  let effects = ReduxSaga.effects
  let getSelectedAccount = state => state.selectedAccount
  let getMarketDetails = (state, marketAddress) => state.markets.marketsDetails[marketAddress]
  let marketsIndex = PredictionMarketsIndex.deployed()
  return function* () {
    yield [
      ReduxSaga.takeLatest('REQ_SELECT_MARKET', reqSelectMarket),
      ReduxSaga.takeLatest('REQ_REFRESH_BETS', reqRefreshBets),
      ReduxSaga.takeLatest('REQ_BET', reqBet),
      ReduxSaga.takeLatest('REQ_GIVE_VERDICT', reqGiveVerdict),
      ReduxSaga.takeLatest('REQ_WITHDRAW_FEES', reqWithdrawFees),
      ReduxSaga.takeLatest('REQ_WITHDRAW_PRIZE', reqWithdrawPrize),
      ReduxSaga.takeLatest('REQ_WITHDRAW', reqWithdraw),
      ReduxSaga.takeEvery('NEW_TX_MARKET_CALL', newTxMarketCall),
    ]
  }

  function* reqSelectMarket({marketAddress}) {
    try {
      yield* refreshBets({marketAddress})
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_SELECT_MARKET', error})
    }
  }

  function* reqRefreshBets() {
    try {
      marketAddress = yield effects.select(state => state.marketOperations.selectedMarket)
      yield* refreshBets({marketAddress})
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_REFRESH_BETS', error})
    }
  }

  function* refreshBets({marketAddress}) {
    let forAddress = (yield effects.select(getSelectedAccount)).address
    let details = yield effects.select(getMarketDetails, marketAddress)
    let tokens = yield [
      effects.call(AnswerToken.at(details.yes).balanceOf.call, forAddress),
      effects.call(AnswerToken.at(details.no).balanceOf.call, forAddress),
    ]
    yield effects.put({type: 'SET_SELECTED_MARKET', marketAddress, yesBets: tokens[0], noBets: tokens[1]})
  }

  function* reqBet({marketAddress, what, value}) {
    try {
      let from = yield effects.select(getSelectedAccount)
      let details = yield effects.select(getMarketDetails, marketAddress)
      let price = what === 'yes' ? details.getYesPrice : details.getNoPrice

      if(!from.address) throw new Error('Missing selected account for the operation')
      if(!marketAddress) throw new Error('Market address missing')
      if(what!=='yes' && what!=='no') throw new Error('Only yes or no allowed bids')
      if(!value) throw new Error('Bid amount missing')
      if(price.greaterThan(value)) throw new Error('Too low amount')

      market = PredictionMarket.at(marketAddress)
      bidfn = what === 'yes' ? 'bidYes' : 'bidNo'
      let txid = yield effects.call([market, market[bidfn]], {from: from.address, value: value})
      $log.info('betting', value, 'on', what, 'to', marketAddress, 'txid:', txid)
      yield effects.call(predictionMarketService.transactionReceiptMined, txid)
      $log.info('Transaction ' + txid + ' mined')
      yield [
        effects.put(marketsListActions.reqRefreshMarket(marketAddress)),
        effects.put({ type: 'REQ_REFRESH_BETS' })
      ]
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_BET', error})
    }
  }

  function* reqGiveVerdict({marketAddress, what}) {
    try {
      let from = yield effects.select(getSelectedAccount)
      let details = yield effects.select(getMarketDetails, marketAddress)

      if(!from.address) throw new Error('Missing selected account for the operation')
      if(from.address != details.responder) throw new Error('Only responder il allowed to give verdict')
      if(!marketAddress) throw new Error('Market address missing')
      if(what!=='yes' && what!=='no') throw new Error('Only yes or no allowed verdict')

      yield* callMarket(marketAddress, 'answer', what === 'yes', {from: from.address})
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_GIVE_VERDICT', error})
    }
  }

  function* reqWithdrawFees({marketAddress}) {
    try {
      let from = yield effects.select(getSelectedAccount)
      let details = yield effects.select(getMarketDetails, marketAddress)

      if(!from.address) throw new Error('Missing selected account for the operation')
      if(from.address != details.owner) throw new Error('Only owner il allowed to give verdict')
      if(!marketAddress) throw new Error('Market address missing')

      yield* callMarket(marketAddress, 'withdrawFees', {from: from.address})
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_WITHDRAW_FEES', error})
    }
  }

  function* reqWithdrawPrize({marketAddress}) {
    try {
      let from = yield effects.select(getSelectedAccount)

      if(!from.address) throw new Error('Missing selected account for the operation')
      if(!marketAddress) throw new Error('Market address missing')

      yield* callMarket(marketAddress, 'withdrawPrize', {from: from.address})
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_WITHDRAW_PRIZE', error})
    }
  }

  function* reqWithdraw({marketAddress}) {
    try {
      let from = yield effects.select(getSelectedAccount)

      if(!from.address) throw new Error('Missing selected account for the operation')
      if(!marketAddress) throw new Error('Market address missing'),

      yield* callMarket(marketAddress, 'withdraw', {from: from.address})
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_WITHDRAW', error})
    }
  }

  function* callMarket(marketAddress, method, ...args) {
    var market = PredictionMarket.at(marketAddress)
    let txid = yield effects.call([market, market[method]], ...args)
    yield effects.put({type: 'NEW_TX_MARKET_CALL', txid, marketAddress})
  }

  function* newTxMarketCall({txid, marketAddress}) {
    try {
      yield effects.call(predictionMarketService.transactionReceiptMined, txid)
      $log.info('Transaction ' + txid + ' mined')
      yield effects.put(marketsListActions.reqRefreshMarket(marketAddress))
    } catch (error) {
      $log.error(error)
      yield effects.put({type: 'ERR_TX_MARKET_CALL', error})
    }
  }


})
