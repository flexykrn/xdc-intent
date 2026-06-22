import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

function CreateIntent() {
  const [token, setToken] = useState('')
  const [amount, setAmount] = useState('')
  const [minOutput, setMinOutput] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [expiry, setExpiry] = useState('3600')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // TODO: Connect wallet and create intent
      toast.success('Intent created successfully!')
    } catch (error) {
      toast.error('Failed to create intent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create Intent</h1>

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
          />
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expiry (seconds)
            </label>
            <input
              type="number"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder="3600"
              className="input"
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary py-3 text-lg"
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