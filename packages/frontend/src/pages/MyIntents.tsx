import { Link } from 'react-router-dom'
import { Clock, CheckCircle, XCircle, AlertCircle, Wallet } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import { useIntents } from '../hooks/useIntents'
import { useState, useEffect } from 'react'

function MyIntents() {
  const { address, isConnected, connect } = useWallet()
  const { getUserIntents } = useIntents()
  const [intents, setIntents] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isConnected && address) {
      loadIntents()
    }
  }, [isConnected, address])

  const loadIntents = async () => {
    if (!address) return
    setLoading(true)
    try {
      const userIntents = await getUserIntents(address)
      setIntents(userIntents)
    } catch (err) {
      console.error('Error loading intents:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-blue-500" />
      case 'fulfilled':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'expired':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="badge-info">Pending</span>
      case 'fulfilled':
        return <span className="badge-success">Fulfilled</span>
      case 'expired':
        return <span className="badge-error">Expired</span>
      default:
        return <span className="badge">Unknown</span>
    }
  }

  if (!isConnected) {
    return (
      <div className="text-center py-16">
        <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-4">My Intents</h1>
        <p className="text-gray-600 mb-6">Connect your wallet to view your intents</p>
        <button onClick={connect} className="btn-primary">
          Connect Wallet
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Intents</h1>
        <button 
          onClick={loadIntents} 
          disabled={loading}
          className="btn-secondary text-sm"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {intents.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No intents found</p>
          <Link to="/create" className="btn-primary">
            Create Your First Intent
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Token</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Created</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((intent: any) => (
                <tr key={intent.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{intent.id.slice(0, 10)}...</td>
                  <td className="py-3 px-4 text-sm">{intent.token.slice(0, 6)}...</td>
                  <td className="py-3 px-4 text-sm">{intent.amount}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(intent.status)}
                      {getStatusBadge(intent.status)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {intent.createdAt.toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      to={`/intent/${intent.id}`}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default MyIntents