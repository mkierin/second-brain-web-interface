import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api'
import ForceGraph2D from 'react-force-graph-2d'
import '../styles/GraphView.css'

const TYPE_COLORS = {
  note: '#2a6f4e',
  daily_note: '#f59e0b',
  journal: '#8b5cf6',
  url: '#3b82f6',
  default: '#666',
}

function GraphView({ token }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [stats, setStats] = useState({})
  const [selectedNode, setSelectedNode] = useState(null)
  const [nodeDetail, setNodeDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const fgRef = useRef()

  useEffect(() => {
    loadGraph()
    loadStats()
  }, [])

  const loadGraph = async () => {
    setLoading(true)
    try {
      const res = await api.get('/graph/data', { params: { max_nodes: 200 } })
      const nodes = (res.data.nodes || []).map(n => ({
        ...n,
        color: TYPE_COLORS[n.type] || TYPE_COLORS.default,
      }))
      const links = (res.data.edges || []).map(e => ({
        source: e.source,
        target: e.target,
        label: e.relationship,
      }))
      setGraphData({ nodes, links })
    } catch (err) {
      console.error('Failed to load graph:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const res = await api.get('/graph/stats')
      setStats(res.data)
    } catch (err) {
      console.error('Failed to load graph stats:', err)
    }
  }

  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node)
    setNodeDetail(null)
    try {
      const res = await api.get(`/graph/node/${encodeURIComponent(node.id)}`)
      setNodeDetail(res.data)
    } catch (err) {
      console.error('Failed to load node detail:', err)
    }
  }, [])

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const label = node.title || node.id
    const fontSize = Math.max(10 / globalScale, 2)
    // Count connections
    const linkCount = graphData.links.filter(
      l => (l.source === node.id || l.source?.id === node.id || l.target === node.id || l.target?.id === node.id)
    ).length
    const radius = Math.max(3, Math.min(2 + linkCount * 0.8, 12))

    ctx.beginPath()
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
    ctx.fillStyle = node.color || TYPE_COLORS.default
    ctx.fill()

    if (globalScale > 1.2) {
      ctx.font = `${fontSize}px -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#1a1a1a'
      const displayLabel = label.length > 25 ? label.substring(0, 25) + '...' : label
      ctx.fillText(displayLabel, node.x, node.y + radius + 2)
    }
  }, [graphData.links])

  return (
    <div className="graph-content">
      <div className="graph-header">
        <h1>Knowledge Graph</h1>
        <div className="graph-stats-bar">
          <span>{stats.total_nodes || 0} nodes</span>
          <span>{stats.total_edges || 0} edges</span>
          <span>avg {(stats.avg_connections || 0).toFixed(1)} links</span>
        </div>
      </div>

      <div className="graph-layout">
        <div className="graph-canvas-container">
          {loading ? (
            <div className="graph-loading">Loading graph...</div>
          ) : graphData.nodes.length === 0 ? (
            <div className="graph-empty">No graph data yet. Save some knowledge to build your graph!</div>
          ) : (
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              nodeCanvasObject={nodeCanvasObject}
              onNodeClick={handleNodeClick}
              linkColor={() => '#e5e5e5'}
              linkWidth={0.5}
              backgroundColor="#fafafa"
              width={selectedNode ? undefined : undefined}
              cooldownTicks={100}
              nodePointerAreaPaint={(node, color, ctx) => {
                const linkCount = graphData.links.filter(
                  l => (l.source === node.id || l.source?.id === node.id || l.target === node.id || l.target?.id === node.id)
                ).length
                const radius = Math.max(3, Math.min(2 + linkCount * 0.8, 12))
                ctx.beginPath()
                ctx.arc(node.x, node.y, radius + 2, 0, 2 * Math.PI, false)
                ctx.fillStyle = color
                ctx.fill()
              }}
            />
          )}
        </div>

        {selectedNode && (
          <div className="graph-side-panel">
            <div className="panel-header">
              <h3>{selectedNode.title || selectedNode.id}</h3>
              <button className="panel-close" onClick={() => { setSelectedNode(null); setNodeDetail(null) }}>
                &times;
              </button>
            </div>

            <div className="panel-section">
              <span className="panel-label">Type</span>
              <span className="panel-value node-type-badge" style={{ color: selectedNode.color }}>
                {selectedNode.type}
              </span>
            </div>

            {selectedNode.tags && selectedNode.tags.length > 0 && (
              <div className="panel-section">
                <span className="panel-label">Tags</span>
                <div className="panel-tags">
                  {selectedNode.tags.map((tag, i) => (
                    <span key={i} className="panel-tag">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {nodeDetail ? (
              <>
                {nodeDetail.node?.content && (
                  <div className="panel-section">
                    <span className="panel-label">Content</span>
                    <div className="panel-content">{nodeDetail.node.content.substring(0, 300)}</div>
                  </div>
                )}

                {nodeDetail.related && nodeDetail.related.length > 0 && (
                  <div className="panel-section">
                    <span className="panel-label">Related ({nodeDetail.related.length})</span>
                    <div className="panel-list">
                      {nodeDetail.related.slice(0, 8).map((r, i) => (
                        <div key={i} className="panel-list-item">{r.title || r.id || 'Untitled'}</div>
                      ))}
                    </div>
                  </div>
                )}

                {nodeDetail.backlinks && nodeDetail.backlinks.length > 0 && (
                  <div className="panel-section">
                    <span className="panel-label">Backlinks ({nodeDetail.backlinks.length})</span>
                    <div className="panel-list">
                      {nodeDetail.backlinks.slice(0, 8).map((b, i) => (
                        <div key={i} className="panel-list-item">{b.title || b.id || 'Untitled'}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="panel-loading">Loading details...</div>
            )}
          </div>
        )}
      </div>

      <div className="graph-legend">
        {Object.entries(TYPE_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
          <span key={type} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: color }} />
            {type.replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  )
}

export default GraphView
