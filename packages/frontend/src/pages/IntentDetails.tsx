import { useParams } from 'react-router-dom'
import { ArrowLeft, Clock, CheckCircle, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

function IntentDetails() {
  const { id } = useParams<{ id: string }>()

  // Mock data - would come from blockchain
  const intent = {
    id,
    token: 'XDC',
    amount: '100',
    minOutput: '99',
    status: 'active',
    createdAt: '2024-01-15 10:30:00',
    expiry: '2024-01-15 11:30:00',
    solver: '0xabc...def',
    fee: '0.5',
    slippage: '0.5',
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-blue-600 bg-blue-50'
      case 'fulfilled':
        return 'text-green-600 bg-green-50'
      case 'expired':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/my-intents" className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to My Intents
      </Link>

      <h1 className="text-3xl font-bold mb-8">Intent Details</h1>

      <div className="card space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500 mb-1">Intent ID</div>
            <div className="font-mono text-sm">{intent.id}</div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(intent.status)}`}>
            {intent.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-gray-500 mb-1">Token</div>
            <div className="text-lg font-semibold">{intent.token}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Amount</div>
            <div className="text-lg font-semibold">{intent.amount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Minimum Output</div>
            <div className="text-lg font-semibold">{intent.minOutput}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Slippage</div>
            <div className="text-lg font-semibold">{intent.slippage}%</div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <div className="text-sm text-gray-500">Created</div>
                <div className="text-sm font-medium">{intent.createdAt}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <div className="text-sm text-gray-500">Expires</div>
                <div className="text-sm font-medium">{intent.expiry}</div>
              </div>
            </div>
          </div>
        </div>

        {intent.status === 'fulfilled' && (
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <div className="text-sm text-gray-500">Fulfilled by</div>
                <div className="text-sm font-medium font-mono">{intent.solver}</div>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-gray-400" />
              <div>
                <div className="text-sm text-gray-500">Solver Fee</div>
                <div className="text-sm font-medium">{intent.fee}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default IntentDetails