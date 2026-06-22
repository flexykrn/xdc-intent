import { useState } from 'react'
import { Activity, TrendingUp, AlertCircle, Zap } from 'lucide-react'

function SolverDashboard() {
  const [activeTab, setActiveTab] = useState('intents')

  // Mock data - would come from blockchain
  const activeIntents = [
    {
      id: '0x123...abc',
      token: 'XDC',
      amount: '100',
      minOutput: '99',
      profit: '0.5',
      expiry: '2024-01-15 11:30',
    },
    {
      id: '0x456...def',
      token: 'USDC',
      amount: '50',
      minOutput: '49',
      profit: '0.3',
      expiry: '2024-01-15 10:30',
    },
  ]

  const myBids = [
    {
      intentId: '0x123...abc',
      amount: '100',
      fee: '0.5',
      status: 'winning',
      timestamp: '2024-01-15 10:35',
    },
    {
      intentId: '0x789...ghi',
      amount: '0.5',
      fee: '0.3',
      status: 'lost',
      timestamp: '2024-01-15 10:20',
    },
  ]

  const stats = {
    totalFulfilled: 45,
    totalProfit: '12.5',
    successRate: '92',
    avgProfit: '0.28',
    reputation: '8500',
    rank: '3',
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Solver Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Total Fulfilled</div>
              <div className="text-2xl font-bold">{stats.totalFulfilled}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Total Profit</div>
              <div className="text-2xl font-bold">{stats.totalProfit} TXDC</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Zap className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Success Rate</div>
              <div className="text-2xl font-bold">{stats.successRate}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card mb-6">
        <div className="flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('intents')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'intents'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Active Intents
          </button>
          <button
            onClick={() => setActiveTab('bids')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'bids'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            My Bids
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'performance'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Performance
          </button>
        </div>
      </div>

      {/* Active Intents Tab */}
      {activeTab === 'intents' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Token</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Min Output</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Est. Profit</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Expiry</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeIntents.map((intent) => (
                <tr key={intent.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{intent.id}</td>
                  <td className="py-3 px-4 text-sm">{intent.token}</td>
                  <td className="py-3 px-4 text-sm">{intent.amount}</td>
                  <td className="py-3 px-4 text-sm">{intent.minOutput}</td>
                  <td className="py-3 px-4 text-sm text-green-600">+{intent.profit}%</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{intent.expiry}</td>
                  <td className="py-3 px-4">
                    <button className="btn-primary text-sm">Bid</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* My Bids Tab */}
      {activeTab === 'bids' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Intent ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Fee</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Time</th>
              </tr>
            </thead>
            <tbody>
              {myBids.map((bid, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{bid.intentId}</td>
                  <td className="py-3 px-4 text-sm">{bid.amount}</td>
                  <td className="py-3 px-4 text-sm">{bid.fee}%</td>
                  <td className="py-3 px-4">
                    <span
                      className={`badge ${
                        bid.status === 'winning' ? 'badge-success' : 'badge-error'
                      }`}
                    >
                      {bid.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">{bid.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Average Profit</span>
                <span className="font-medium">{stats.avgProfit}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Success Rate</span>
                <span className="font-medium">{stats.successRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reputation Score</span>
                <span className="font-medium">{stats.reputation}/10000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Rank</span>
                <span className="font-medium">#{stats.rank}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-full">
                  <Activity className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Fulfilled intent 0x123...abc</div>
                  <div className="text-xs text-gray-500">2 minutes ago</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-full">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Submitted bid for 0x456...def</div>
                  <div className="text-xs text-gray-500">5 minutes ago</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-full">
                  <Activity className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Fulfilled intent 0x789...ghi</div>
                  <div className="text-xs text-gray-500">15 minutes ago</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SolverDashboard
