import { useState } from 'react'
import { ArrowRight, Loader2, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWallet } from '../hooks/useWallet'
import { useIntents } from '../hooks/useIntents'

function CreateIntent() {
  const { address, isConnected, connect, signer } = useWallet()
  const { createIntent } = useIntents()
  
  const [token, setToken] = useState('')
  const [amount, setAmount] = useState('')
  const [minOutput, setMinOutput] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [expiry, setExpiry] = useState('1')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isConnected || !signer) {
      toast.error('Please connect your wallet first')
      return
    }

    setLoading(true)

    try {
      const result = await createIntent(
        signer,
        token,
        amount,
        parseInt(expiry)
      )
      
      toast.success(
        <div>
          <p>Intent created successfully!</p>
          <p className="text-xs mt-1">Tx: {result.txHash.slice(0, 20)}...</p>
        </div>
      )
      
      // Reset form
      setToken('')
      setAmount('')
      setMinOutput('')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create intent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create Intent</h1>

      {!isConnected && (
        <div className="card mb-6 text-center">
          <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Connect your wallet to create intents</p>
          <button onClick={connect} className="btn-primary">
            Connect Wallet
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Token Address
          </label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="0x..."
            className="input"
            required
            disabled={!isConnected}
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter the token contract address you want to trade
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="input"
            required
            disabled={!isConnected}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Minimum Output
          </label>
          <input
            type="number"
            value={minOutput}
            onChange={(e) => setMinOutput(e.target.value)}
            placeholder="99"
            className="input"
            required
            disabled={!isConnected}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Slippage Tolerance (%)
            </label>
            <input
              type="number"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              step="0.1"
              min="0.1"
              max="5"
              className="input"
              disabled={!isConnected}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expiry (hours)
            </label>
            <input
              type="number"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              min="1"
              max="24"
              className="input"
              disabled={!isConnected}
            />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Expected Rate</span>
            <span className="font-medium">1.00</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Minimum Received</span>
            <span className="font-medium">{minOutput || '0'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Solver Fee</span>
            <span className="font-medium">0.5%</span>
          </div>
          {isConnected && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your Balance</span>
              <span className="font-medium">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !isConnected}
          className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Create Intent
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default CreateIntent