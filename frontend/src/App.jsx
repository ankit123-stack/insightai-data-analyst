import { useState } from 'react'
import {
  Upload,
  FileSpreadsheet,
  Database,
  Rows3,
  Columns3,
  AlertTriangle,
  Sparkles,
  Send,
  RefreshCw,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package,
  Trophy,
  Target,
  Lightbulb,
  BarChart3,
  Download,
  MessageSquare,
  Table2
} from 'lucide-react'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import './cleaning.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8002'

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function formatNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    !Number.isFinite(Number(value))
  ) {
    return '—'
  }

  return Number(value).toLocaleString('en-IN', {
    maximumFractionDigits: 2
  })
}

function getStat(summary, keyword, field) {
  if (!summary) return undefined

  const column = Object.keys(summary).find((name) =>
    name.toLowerCase().includes(keyword.toLowerCase())
  )

  return column ? summary[column]?.[field] : undefined
}

function formatLabel(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function getChartCategory(row, item) {
  return (
    row.category ??
    row.name ??
    row.label ??
    row.x ??
    row[item.x_key] ??
    row.value ??
    ''
  )
}

function getChartValue(row, item) {
  const value =
    row[item.y_key] ??
    row.y ??
    row.count ??
    row.value ??
    0

  return Number(value) || 0
}

function normalizeProfileData(data) {
  const backendProfile = data.profile || {}

  return {
    dataset_id: data.dataset_id,
    rows: backendProfile.rows ?? data.rows ?? 0,
    columns_count:
      backendProfile.columns_count ??
      backendProfile.columns ??
      data.columns?.length ??
      0,
    missing_cells:
      backendProfile.missing_cells ??
      backendProfile.missing_values ??
      0,
    duplicate_rows: backendProfile.duplicate_rows ?? 0,
    column_names:
      data.columns ||
      backendProfile.column_names ||
      backendProfile.column_profiles?.map(
        (column) => column.name
      ) ||
      [],
    preview: data.preview || backendProfile.preview || [],
    columns:
      backendProfile.column_profiles ||
      backendProfile.columns_profile ||
      backendProfile.columns_data ||
      [],
    quality: data.quality || backendProfile.quality || null
  }
}

function normalizeChart(item) {
  const rows = Array.isArray(item.data) ? item.data : []

  // ------------------------------------------------
  // HISTOGRAM — preserve counts and generate ranges
  // ------------------------------------------------

  if (item.type === 'histogram') {
    const parsed = rows.map((row, index) => {
      const rawCategory =
        row.category ??
        row.name ??
        row.label ??
        row.x ??
        row[item.x_key] ??
        row.value ??
        index

      const rawCount =
        row.count ??
        row[item.y_key] ??
        row.y ??
        (row.category !== undefined ? row.value : undefined) ??
        0

      // Support both numeric bin centers and labels
      // such as "0-100" or "0–100".
      const label = String(rawCategory).trim()
      const rangeMatch = label.match(
        /^\s*(-?[\d,.]+)\s*[-–—]\s*(-?[\d,.]+)\s*$/
      )

      const lowerFromLabel = rangeMatch
        ? Number(rangeMatch[1].replace(/,/g, ''))
        : NaN

      const upperFromLabel = rangeMatch
        ? Number(rangeMatch[2].replace(/,/g, ''))
        : NaN

      const numericCategory = Number(
        label.replace(/,/g, '')
      )

      return {
        rawCategory: label,
        numericCategory,
        lowerFromLabel,
        upperFromLabel,
        count: Number(rawCount) || 0,
        index
      }
    })

    // If the API already supplies explicit ranges,
    // retain those ranges and their original counts.
    const explicitRanges = parsed.every(
      (row) =>
        Number.isFinite(row.lowerFromLabel) &&
        Number.isFinite(row.upperFromLabel)
    )

    if (explicitRanges && parsed.length > 0) {
      return {
        title: item.title || 'Sales distribution',
        type: 'histogram',
        data: parsed.map((row) => ({
          category: `${formatNumber(
            row.lowerFromLabel
          )}–${formatNumber(row.upperFromLabel)}`,
          value: row.count
        }))
      }
    }

    const numericRows = parsed.filter((row) =>
      Number.isFinite(row.numericCategory)
    )

    const countByCenter = new Map()

    numericRows.forEach((row) => {
      const center = row.numericCategory

      countByCenter.set(
        center,
        (countByCenter.get(center) || 0) + row.count
      )
    })

    const sortedCenters = [...countByCenter.keys()].sort(
      (a, b) => a - b
    )

    // Fall back safely if numeric centers cannot be inferred.
    if (sortedCenters.length < 2) {
      return {
        title: item.title || 'Sales distribution',
        type: 'histogram',
        data: parsed.map((row) => ({
          category: row.rawCategory,
          value: row.count
        }))
      }
    }

    const differences = sortedCenters
      .slice(1)
      .map((center, index) => center - sortedCenters[index])
      .filter((difference) => difference > 0)

    const sortedDifferences = [...differences].sort(
      (a, b) => a - b
    )

    const middle = Math.floor(sortedDifferences.length / 2)

    const step =
      sortedDifferences.length % 2 === 0
        ? (
            sortedDifferences[middle - 1] +
            sortedDifferences[middle]
          ) / 2
        : sortedDifferences[middle]

    if (!Number.isFinite(step) || step <= 0) {
      return {
        title: item.title || 'Sales distribution',
        type: 'histogram',
        data: parsed.map((row) => ({
          category: row.rawCategory,
          value: row.count
        }))
      }
    }

    // Fill a gap only when the center spacing is a
    // near-integer multiple of the inferred bin width.
    const completedCenters = [sortedCenters[0]]

    for (let index = 1; index < sortedCenters.length; index++) {
      const previousCenter = sortedCenters[index - 1]
      const currentCenter = sortedCenters[index]
      const difference = currentCenter - previousCenter
      const intervals = Math.round(difference / step)

      const tolerance = Math.max(Math.abs(step) * 0.05, 1e-9)

      const regularGap =
        intervals > 1 &&
        Math.abs(difference - intervals * step) <= tolerance

      if (regularGap) {
        for (let missingIndex = 1; missingIndex < intervals; missingIndex++) {
          completedCenters.push(
            previousCenter + missingIndex * step
          )
        }
      }

      completedCenters.push(currentCenter)
    }

    // Convert every center to a readable range.
    const histogramData = completedCenters.map((center) => {
      const lower = center - step / 2
      const upper = center + step / 2

      return {
        category: `${formatNumber(Math.round(lower))}–${formatNumber(
          Math.round(upper)
        )}`,
        value: countByCenter.get(center) || 0
      }
    })

    return {
      title: item.title || 'Sales distribution',
      type: 'histogram',
      data: histogramData
    }
  }

  // ------------------------------------------------
  // NORMAL CHARTS — unchanged
  // ------------------------------------------------

  return {
    title: item.title || 'Data visualization',
    type: item.type || 'bar',
    data: rows.map((row) => ({
      category: formatLabel(getChartCategory(row, item)),
      value: getChartValue(row, item)
    }))
  }
}

// --------------------------------------------------
// RELIABLE BLOB DOWNLOAD
// --------------------------------------------------

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)

  try {
    link.click()
  } finally {
    link.remove()

    // Do not revoke immediately. Some browsers need time
    // to start the download.
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 1500)
  }
}

// --------------------------------------------------
// METRIC
// --------------------------------------------------

function Metric({
  icon,
  label,
  value,
  detail,
  polished = false,
  qualityStatus,
  hoverHighlight = false,
  iconTarget,
  onIconClick
}) {
  const cardStyle = polished
    ? {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        minHeight: '172px',
        padding: '20px',
        borderColor:
          qualityStatus === 'good' ? '#d9eee5' : '#e9ecf4',
        background: '#fff',
        boxShadow: '0 8px 24px rgba(31, 42, 75, 0.05)'
      }
    : undefined

  const iconStyle = polished
    ? {
        width: '40px',
        height: '40px',
        marginBottom: '18px',
        background: (
          qualityStatus === 'good'
            ? '#eaf8f1'
            : qualityStatus === 'warning'
              ? '#fff5e8'
              : '#efefff'
          ),
        color: (
          qualityStatus === 'good'
            ? '#29976b'
            : qualityStatus === 'warning'
              ? '#c47a1b'
              : '#686bef'
          )
      }
    : undefined

  return (
    <div
      className={`metric${hoverHighlight ? ' kpi-hover-card' : ''}`}
      style={cardStyle}
    >
      <a
        className="metric-icon"
        href={`#${iconTarget}`}
        aria-label={`Go to ${label} section`}
        onClick={onIconClick}
        style={{
          ...iconStyle,
          cursor: 'pointer',
          textDecoration: 'none'
        }}
      >
        {icon}
      </a>
      <small
        style={
          polished
            ? {
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.2px'
              }
            : undefined
        }
      >
        {label}
      </small>
      <strong
        style={
          polished
            ? {
                margin: '6px 0 4px',
                fontSize: 'clamp(25px, 2.2vw, 32px)',
                lineHeight: 1.15,
                letterSpacing: '-0.7px',
                color: '#20263a'
              }
            : undefined
        }
      >
        {value}
      </strong>
      <span
        style={
          polished
            ? {
                marginTop: 'auto',
                paddingTop: '8px',
                lineHeight: 1.45,
                color:
                  qualityStatus === 'good'
                    ? '#29976b'
                    : qualityStatus === 'warning'
                      ? '#b7791f'
                      : undefined
              }
            : undefined
        }
      >
        {detail}
      </span>
    </div>
  )
}

// --------------------------------------------------
// SECTION TITLE
// --------------------------------------------------

function SectionTitle({ eyebrow, title, detail }) {
  return (
    <div className="section-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {detail && <p className="muted">{detail}</p>}
    </div>
  )
}

// --------------------------------------------------
// BUSINESS INSIGHTS
// --------------------------------------------------

function buildBusinessInsights(analytics, profile) {
  if (!analytics || !profile) return []

  const insights = []
  const business = analytics.business_insights || {}
  const numericSummary = analytics.numeric_summary || {}

  if (business.top_product) {
    insights.push({
      icon: <Trophy size={18} />,
      title: 'Top-performing product',
      text: `${business.top_product.name} generated ${formatNumber(
        business.top_product.sales
      )} in sales.`,
      type: 'positive'
    })
  }

  if (business.lowest_product) {
    insights.push({
      icon: <Target size={18} />,
      title: 'Product to review',
      text: `${business.lowest_product.name} recorded ${formatNumber(
        business.lowest_product.sales
      )} in sales. Review demand, pricing, and customer preferences.`,
      type: 'attention'
    })
  }

  if (business.best_region) {
    insights.push({
      icon: <TrendingUp size={18} />,
      title: 'Strongest region',
      text: `${business.best_region.name} leads regional sales with ${formatNumber(
        business.best_region.sales
      )}.`,
      type: 'positive'
    })
  }

  const salesColumn = Object.keys(numericSummary).find((name) =>
    /sales|revenue|turnover/i.test(name)
  )

  const totalSales =
    business.total_sales ??
    numericSummary[salesColumn]?.sum

  const averageSales =
    business.average_sales ??
    numericSummary[salesColumn]?.mean

  if (totalSales !== undefined) {
    insights.push({
      icon: <DollarSign size={18} />,
      title: 'Overall sales performance',
      text: `Total recorded sales are ${formatNumber(
        totalSales
      )}, with an average of ${formatNumber(
        averageSales
      )} per record.`,
      type: 'positive'
    })
  }

  if (business.highest_sale !== undefined) {
    insights.push({
      icon: <Lightbulb size={18} />,
      title: 'Highest individual sale',
      text: `The highest single recorded sale is ${formatNumber(
        business.highest_sale
      )}.`,
      type: 'neutral'
    })
  }

  if (insights.length === 0) {
    const numericColumn = Object.keys(numericSummary)[0]

    const summary = numericColumn
      ? numericSummary[numericColumn]
      : null

    if (summary) {
      insights.push({
        icon: <BarChart3 size={18} />,
        title: `Summary: ${numericColumn}`,
        text: `The total is ${formatNumber(
          summary.sum
        )}, the average is ${formatNumber(
          summary.mean
        )}, and the maximum is ${formatNumber(
          summary.max
        )}.`,
        type: 'positive'
      })
    }

    insights.push({
      icon: <Database size={18} />,
      title: 'Dataset overview',
      text: `Your dataset contains ${formatNumber(
        profile.rows
      )} rows and ${formatNumber(
        profile.columns_count
      )} columns.`,
      type: 'neutral'
    })
  }

  insights.push({
    icon: <ShoppingCart size={18} />,
    title: 'Profit margin',
    text:
      business.profit_margin === undefined ||
      business.profit_margin === null
        ? 'Profit margin is unavailable because profit/cost information is not available.'
        : `The overall profit margin is ${formatNumber(
            business.profit_margin
          )}%.`,
    type: 'neutral'
  })

  return insights
}

// --------------------------------------------------
// MAIN APP
// --------------------------------------------------

export default function App() {
  const [selectedNavigation, setSelectedNavigation] =
    useState('Data overview')
  const [profile, setProfile] = useState(null)
  const [chart, setChart] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [interactiveChartType, setInteractiveChartType] =
    useState('bar')
  const [interactiveDimension, setInteractiveDimension] =
    useState('region')
  const [fileName, setFileName] = useState('')
  const [uploadedDatasets, setUploadedDatasets] = useState([])
  const [selectedCompareDataset1, setSelectedCompareDataset1] =
    useState('')
  const [selectedCompareDataset2, setSelectedCompareDataset2] =
    useState('')
  const [comparison, setComparison] = useState(null)
  const [comparisonBusy, setComparisonBusy] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState([])
  const [busy, setBusy] = useState(false)
  const [excelDownloadBusy, setExcelDownloadBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cleaningBusy, setCleaningBusy] = useState(false)
  const [cleaningPreview, setCleaningPreview] = useState(null)
  const [cleaningApplied, setCleaningApplied] = useState(false)
  const [cleaningOptions, setCleaningOptions] = useState({
    remove_duplicates: false,
    fill_missing: {},
    drop_columns: [],
    convert_types: {},
    outliers: {}
  })

 // ------------------------------------------------
  // UPLOAD CSV / EXCEL AND LOAD ANALYTICS
  // ------------------------------------------------

  async function upload(file) {
    if (!file) return

    const fileName = file.name.toLowerCase()

    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
      setError('Please select a CSV (.csv) or Excel (.xlsx) file.')
      setSuccess('')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('File size must be less than 15 MB.')
      setSuccess('')
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')
    setAnswers([])
    setChart(null)
    setAnalytics(null)
    setProfile(null)
    setCleaningPreview(null)
    setCleaningApplied(false)
    setCleaningOptions({
      remove_duplicates: false,
      fill_missing: {},
      drop_columns: [],
      convert_types: {},
      outliers: {}
    })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(
        `${API}/api/upload`,
        {
          method: 'POST',
          body: formData
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || 'File upload failed.'
        )
      }

      const uploadedDataset = {
        dataset_id: data.dataset_id,
        filename: data.filename || file.name
      }
      setUploadedDatasets((previous) => [
        ...previous.filter(
          (dataset) => dataset.dataset_id !== data.dataset_id
        ),
        uploadedDataset
      ])
      setSelectedCompareDataset1(
        (selected) => selected || data.dataset_id
      )
      setSelectedCompareDataset2((selected) =>
        uploadedDatasets.length < 2
          ? data.dataset_id
          : selected || data.dataset_id
      )

      const normalizedProfile =
        normalizeProfileData(data)

      setProfile(normalizedProfile)
      setFileName(
        data.filename || file.name
      )

      const [
        chartResult,
        analyticsResult
      ] = await Promise.allSettled([
        fetch(
          `${API}/api/chart/${data.dataset_id}`
        ).then(async (res) => {
          const result = await res.json()

          if (!res.ok) {
            throw new Error(
              result.detail ||
                'Chart loading failed.'
            )
          }

          return result
        }),

        fetch(
          `${API}/api/analytics/${data.dataset_id}`
        ).then(async (res) => {
          const result = await res.json()

          if (!res.ok) {
            throw new Error(
              result.detail ||
                'Analytics loading failed.'
            )
          }

          return result
        })
      ])

      let normalizedCharts = []

      if (chartResult.status === 'fulfilled') {
        normalizedCharts = (
          chartResult.value.charts || []
        ).map(normalizeChart)

        setChart(
          normalizedCharts[0] || null
        )
      }

      if (analyticsResult.status === 'fulfilled') {
        const result =
          analyticsResult.value

        const numericSummary =
          result.numeric_summary || {}

        const hasSalesKpis =
          Object.keys(numericSummary).some(
            (name) =>
              /sales|revenue|turnover/i.test(
                name
              )
          )

        const kpis = {
          total_sales:
            result.business_insights
              ?.total_sales ??
            getStat(
              numericSummary,
              'sales',
              'sum'
            ) ??
            getStat(
              numericSummary,
              'revenue',
              'sum'
            ),

          total_profit:
            result.business_insights
              ?.total_profit ??
            getStat(
              numericSummary,
              'profit',
              'sum'
            ),

          average_sales:
            result.business_insights
              ?.average_sales ??
            getStat(
              numericSummary,
              'sales',
              'mean'
            ) ??
            getStat(
              numericSummary,
              'revenue',
              'mean'
            ),

          average_quantity:
            getStat(
              numericSummary,
              'quantity',
              'mean'
            )
        }

        setAnalytics({
          ...result,
          kpis: hasSalesKpis
            ? kpis
            : null,
          charts: normalizedCharts
        })
      } else {
        setError(
          `File uploaded, but analytics could not load: ${
            analyticsResult.reason?.message ||
            'Unknown error'
          }`
        )
      }

      if (chartResult.status === 'rejected') {
        setError((previous) =>
          previous
            ? `${previous} Charts could not load.`
            : 'File uploaded, but charts could not load.'
        )
      }

      if (
        analyticsResult.status ===
          'fulfilled' &&
        chartResult.status ===
          'fulfilled'
      ) {
        setSuccess(
          'File uploaded and analysis completed successfully.'
        )
      }
    } catch (err) {
      setError(
        `${err.message}. Make sure the backend is running at ${API}.`
      )
    } finally {
      setBusy(false)
    }
  }

  async function compareUploadedDatasets(event) {
    event.preventDefault()
    setComparisonError('')
    setComparison(null)
    setComparisonBusy(true)

    try {
      const response = await fetch(`${API}/api/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dataset_1_id: selectedCompareDataset1,
          dataset_2_id: selectedCompareDataset2
        })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || 'Could not compare the selected datasets.'
        )
      }

      setComparison(data)
    } catch (err) {
      setComparisonError(
        err.message || 'Comparison failed. Please try again.'
      )
    } finally {
      setComparisonBusy(false)
    }
  }

  function updateCleaningOptions(update) {
    setCleaningOptions((current) => update(current))
    setCleaningPreview(null)
  }

  async function requestCleaning(action, operations) {
    const response = await fetch(
      `${API}/api/clean/${profile.dataset_id}/${action}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body:
          operations === undefined
            ? undefined
            : JSON.stringify({ operations })
      }
    )
    const result = await response.json()

    if (!response.ok) {
      throw new Error(
        result.detail || 'Data cleaning request failed.'
      )
    }

    return result
  }

  async function refreshAnalysis(datasetId) {
    const [chartResponse, analyticsResponse] =
      await Promise.all([
        fetch(`${API}/api/chart/${datasetId}`),
        fetch(`${API}/api/analytics/${datasetId}`)
      ])
    const [chartResult, analyticsResult] =
      await Promise.all([
        chartResponse.json(),
        analyticsResponse.json()
      ])

    if (!chartResponse.ok) {
      throw new Error(
        chartResult.detail || 'Chart refresh failed.'
      )
    }
    if (!analyticsResponse.ok) {
      throw new Error(
        analyticsResult.detail || 'Analytics refresh failed.'
      )
    }

    const normalizedCharts =
      (chartResult.charts || []).map(normalizeChart)
    const numericSummary =
      analyticsResult.numeric_summary || {}
    const hasSalesKpis = Object.keys(numericSummary).some(
      (name) => /sales|revenue|turnover/i.test(name)
    )
    const kpis = {
      total_sales:
        analyticsResult.business_insights?.total_sales ??
        getStat(numericSummary, 'sales', 'sum') ??
        getStat(numericSummary, 'revenue', 'sum'),
      total_profit:
        analyticsResult.business_insights?.total_profit ??
        getStat(numericSummary, 'profit', 'sum'),
      average_sales:
        analyticsResult.business_insights?.average_sales ??
        getStat(numericSummary, 'sales', 'mean') ??
        getStat(numericSummary, 'revenue', 'mean'),
      average_quantity: getStat(
        numericSummary,
        'quantity',
        'mean'
      )
    }

    setChart(normalizedCharts[0] || null)
    setAnalytics({
      ...analyticsResult,
      kpis: hasSalesKpis ? kpis : null,
      charts: normalizedCharts
    })
  }

  async function previewCleaning() {
    if (!profile || cleaningBusy) return

    setCleaningBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await requestCleaning(
        'preview',
        cleaningOptions
      )
      setCleaningPreview(result)
    } catch (err) {
      setError(err.message || 'Could not preview cleaning.')
    } finally {
      setCleaningBusy(false)
    }
  }

  async function applyCleaning() {
    if (!profile || !cleaningPreview || cleaningBusy) return

    setCleaningBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await requestCleaning(
        'apply',
        cleaningOptions
      )
      setProfile(
        normalizeProfileData({
          dataset_id: profile.dataset_id,
          columns: result.profile.column_profiles?.map(
            (column) => column.name
          ),
          profile: result.profile,
          quality: result.quality,
          preview: result.preview
        })
      )
      setCleaningApplied(true)
      setCleaningPreview(null)
      await refreshAnalysis(profile.dataset_id)
      setSuccess(
        'Cleaning changes applied. The original dataset can be restored with Reset cleaning.'
      )
    } catch (err) {
      setError(err.message || 'Could not apply cleaning.')
    } finally {
      setCleaningBusy(false)
    }
  }

  async function resetCleaning() {
    if (!profile || cleaningBusy) return

    setCleaningBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await requestCleaning('reset')
      setProfile(
        normalizeProfileData({
          dataset_id: profile.dataset_id,
          columns: result.profile.column_profiles?.map(
            (column) => column.name
          ),
          profile: result.profile,
          quality: result.quality,
          preview: result.preview
        })
      )
      setCleaningOptions({
        remove_duplicates: false,
        fill_missing: {},
        drop_columns: [],
        convert_types: {},
        outliers: {}
      })
      setCleaningPreview(null)
      setCleaningApplied(false)
      await refreshAnalysis(profile.dataset_id)
      setSuccess('Original uploaded data restored.')
    } catch (err) {
      setError(err.message || 'Could not restore the original data.')
    } finally {
      setCleaningBusy(false)
    }
  }

  async function downloadCleanedCsv() {
    if (!profile || cleaningBusy) return

    setCleaningBusy(true)
    setError('')
    try {
      const response = await fetch(
        `${API}/api/clean/${profile.dataset_id}/download`
      )
      if (!response.ok) {
        const result = await response.json()
        throw new Error(
          result.detail || 'Cleaned CSV download failed.'
        )
      }
      downloadBlob(
        await response.blob(),
        'cleaned_dataset.csv'
      )
      setSuccess('Cleaned CSV downloaded successfully.')
    } catch (err) {
      setError(err.message || 'Could not download cleaned CSV.')
    } finally {
      setCleaningBusy(false)
    }
  }

  // ------------------------------------------------
  // ASK AI ANALYST
  // ------------------------------------------------

  async function ask(e) {
    e.preventDefault()

    if (
      !question.trim() ||
      !profile ||
      busy
    ) {
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(
        `${API}/api/ask`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            dataset_id:
              profile.dataset_id,
            question:
              question.trim()
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail ||
            'Could not answer the question.'
        )
      }

      setAnswers((previous) => [
        {
          q:
            data.question ||
            question.trim(),
          a:
            data.answer ||
            'No answer was returned.'
        },
        ...previous
      ])

      setQuestion('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ------------------------------------------------
  // QUESTION SUGGESTIONS
  // ------------------------------------------------

  const numericColumns = Object.keys(
    analytics?.numeric_summary || {}
  )

  const dimensionLabels = {
    region: 'Sales by Region',
    category: 'Sales by Category',
    product: 'Sales by Product'
  }

  const interactiveChartData = (() => {
    const businessInsights = analytics?.business_insights || {}
    const performanceData =
      interactiveDimension === 'region'
        ? businessInsights.region_performance
        : interactiveDimension === 'product'
          ? businessInsights.product_performance
          : null

    if (performanceData?.length) {
      return performanceData.map((item) => ({
        category: item.name,
        value: Number(item.sales) || 0
      }))
    }

    const chart = analytics?.charts?.find((item) => {
      const title = String(item.title || '').toLowerCase()
      return (
        title.includes(interactiveDimension) &&
        /sales|revenue|turnover/i.test(title)
      )
    })

    return chart?.data || []
  })()

  const suggestions = profile
    ? [
        'How many rows are in this dataset?',
        'Which columns have missing values?',
        'Are there any duplicate rows?',
        ...(numericColumns.length
          ? [
              `What is the average ${numericColumns[0]}?`,
              `What is the highest ${numericColumns[0]}?`,
              'Summarize this dataset'
            ]
          : [
              'Summarize this dataset'
            ])
      ]
    : []

  // ------------------------------------------------
  // COMPLETE JSON REPORT
  // ------------------------------------------------

  function createReport() {
    return {
      application:
        'InsightAI - AI Data Analyst',

      generated_at:
        new Date().toISOString(),

      filename: fileName,

      dataset_profile: profile,

      numeric_summary:
        analytics?.numeric_summary || {},

      categorical_summary:
        analytics?.categorical_summary || {},

      business_insights:
        analytics?.business_insights || {},

      charts:
        analytics?.charts || [],

      recommendations:
        analytics?.business_insights
          ?.recommendations || []
    }
  }

  // ------------------------------------------------
  // DOWNLOAD JSON
  // ------------------------------------------------

  function downloadReport() {
    if (!profile) {
      setError(
        'Upload a CSV or Excel file before downloading a report.'
      )
      return
    }

    try {
      const report = createReport()

      const json = JSON.stringify(
        report,
        null,
        2
      )

      const blob = new Blob(
        [json],
        {
          type:
            'application/json;charset=utf-8'
        }
      )

      const reportName =
  fileName.replace(/\.(csv|xlsx)$/i, '') || 'analysis'

      downloadBlob(
        blob,
        `${reportName}-report.json`
      )

      setSuccess(
        'JSON report downloaded successfully.'
      )

      setError('')
    } catch (err) {
      console.error(
        'JSON report generation failed:',
        err
      )

      setError(
        'Could not generate the JSON report.'
      )
    }
  }

  // ------------------------------------------------
  // DOWNLOAD PDF
  // ------------------------------------------------

  function downloadPdfReport() {
    if (!profile) {
      setError(
        'Upload a CSV or Excel file before downloading a report.'
      )
      return
    }

    try {
      const doc = new jsPDF()

      const pageWidth =
        doc.internal.pageSize.getWidth()

      const pageHeight =
        doc.internal.pageSize.getHeight()

      const margin = 14

      let y = 20

      const reportName =
        fileName.replace(
  /\.(csv|xlsx)$/i,
  ''
) || 'analysis'

      const numericSummary =
        analytics?.numeric_summary || {}

      const categoricalSummary =
        analytics?.categorical_summary || {}

      const business =
        analytics?.business_insights || {}

      const recommendations =
        business.recommendations || []

      const charts =
        analytics?.charts || []

      // ----------------------------------------------
      // PAGE CHECK
      // ----------------------------------------------

      function addPageIfNeeded(
        requiredHeight = 15
      ) {
        if (
          y + requiredHeight >
          pageHeight - 18
        ) {
          doc.addPage()
          y = 20
        }
      }

      // ----------------------------------------------
      // SECTION TITLE
      // ----------------------------------------------

      function addSectionTitle(title) {
        addPageIfNeeded(18)

        y += 4

        doc.setFont(
          'helvetica',
          'bold'
        )

        doc.setFontSize(13)

        doc.setTextColor(
          45,
          55,
          95
        )

        doc.text(
          title,
          margin,
          y
        )

        y += 5

        doc.setTextColor(
          40,
          40,
          40
        )
      }

      // ----------------------------------------------
      // PARAGRAPH
      // ----------------------------------------------

      function addParagraph(text) {
        const lines =
          doc.splitTextToSize(
            String(
              text ?? '—'
            ),
            pageWidth -
              margin * 2
          )

        addPageIfNeeded(
          lines.length * 5 + 3
        )

        doc.setFont(
          'helvetica',
          'normal'
        )

        doc.setFontSize(9)

        doc.text(
          lines,
          margin,
          y
        )

        y +=
          lines.length * 5 +
          2
      }

      // ----------------------------------------------
      // TABLE
      // ----------------------------------------------

      function addTable(options) {
        addPageIfNeeded(25)

        autoTable(doc, {
          ...options,

          startY: y,

          theme: 'striped',

          headStyles: {
            fillColor: [
              70,
              78,
              145
            ],
            textColor: 255,
            ...(options.headStyles ||
              {})
          },

          styles: {
            fontSize: 8,
            cellPadding: 3,
            overflow:
              'linebreak',
            ...(options.styles ||
              {})
          },

          margin: {
            left: margin,
            right: margin,
            ...(options.margin ||
              {})
          }
        })

        y =
          doc.lastAutoTable
            .finalY + 8
      }

      // ----------------------------------------------
      // HEADER
      // ----------------------------------------------

      doc.setFillColor(
        43,
        52,
        100
      )

      doc.rect(
        0,
        0,
        pageWidth,
        43,
        'F'
      )

      doc.setTextColor(
        255,
        255,
        255
      )

      doc.setFont(
        'helvetica',
        'bold'
      )

      doc.setFontSize(23)

      doc.text(
        'InsightAI',
        margin,
        18
      )

      doc.setFont(
        'helvetica',
        'normal'
      )

      doc.setFontSize(12)

      doc.text(
        'AI Data Analyst Report',
        margin,
        27
      )

      doc.setFontSize(9)

      doc.text(
  `Dataset: ${fileName || reportName}`,
  margin,
  35
)

      y = 53

      doc.setTextColor(
        40,
        40,
        40
      )

      addParagraph(
        `Generated: ${new Date().toLocaleString()}`
      )

      // ----------------------------------------------
      // DATASET OVERVIEW
      // ----------------------------------------------

      addSectionTitle(
        '1. Dataset Overview'
      )

      addTable({
        head: [
          ['Metric', 'Value']
        ],

        body: [
          [
            'File name',
            fileName || '—'
          ],
          [
            'Total rows',
            String(
              profile.rows ?? 0
            )
          ],
          [
            'Total columns',
            String(
              profile.columns_count ??
                0
            )
          ],
          [
            'Missing cells',
            String(
              profile.missing_cells ??
                0
            )
          ],
          [
            'Duplicate rows',
            String(
              profile.duplicate_rows ??
                0
            )
          ],
          [
            'Column names',
            (
              profile.column_names ||
              []
            ).join(', ') ||
              '—'
          ]
        ]
      })

      // ----------------------------------------------
      // BUSINESS PERFORMANCE
      // ----------------------------------------------

      addSectionTitle(
        '2. Business Performance'
      )

      const businessRows = []

      if (
        business.total_sales !==
        undefined
      ) {
        businessRows.push([
          'Total sales',
          formatNumber(
            business.total_sales
          )
        ])
      }

      if (
        business.total_profit !==
        undefined
      ) {
        businessRows.push([
          'Total profit',
          formatNumber(
            business.total_profit
          )
        ])
      }

      if (
        business.average_sales !==
        undefined
      ) {
        businessRows.push([
          'Average sales',
          formatNumber(
            business.average_sales
          )
        ])
      }

      if (
        business.profit_margin !==
        undefined
      ) {
        businessRows.push([
          'Profit margin',
          `${formatNumber(
            business.profit_margin
          )}%`
        ])
      }

      if (
        business.highest_sale !==
        undefined
      ) {
        businessRows.push([
          'Highest individual sale',
          formatNumber(
            business.highest_sale
          )
        ])
      }

      if (business.top_product) {
        businessRows.push([
          'Top product',
          `${business.top_product.name} (${formatNumber(
            business.top_product.sales
          )})`
        ])
      }

      if (business.lowest_product) {
        businessRows.push([
          'Lowest product',
          `${business.lowest_product.name} (${formatNumber(
            business.lowest_product.sales
          )})`
        ])
      }

      if (business.best_region) {
        businessRows.push([
          'Best-performing region',
          `${business.best_region.name} (${formatNumber(
            business.best_region.sales
          )})`
        ])
      }

      if (businessRows.length) {
        addTable({
          head: [
            [
              'Business metric',
              'Result'
            ]
          ],
          body: businessRows
        })
      } else {
        addParagraph(
          'No business-specific metrics were available for this dataset.'
        )
      }

      // ----------------------------------------------
      // NUMERIC SUMMARY
      // ----------------------------------------------

      addSectionTitle(
        '3. Numeric Statistical Summary'
      )

      const statisticRows =
        Object.entries(
          numericSummary
        ).map(
          ([name, stats]) => [
            name,
            formatNumber(
              stats.sum
            ),
            formatNumber(
              stats.mean
            ),
            formatNumber(
              stats.median
            ),
            formatNumber(
              stats.min
            ),
            formatNumber(
              stats.max
            )
          ]
        )

      if (statisticRows.length) {
        addTable({
          head: [
            [
              'Column',
              'Sum',
              'Average',
              'Median',
              'Minimum',
              'Maximum'
            ]
          ],

          body: statisticRows,

          styles: {
            fontSize: 7,
            cellPadding: 2
          }
        })
      } else {
        addParagraph(
          'No numeric statistics are available.'
        )
      }

      // ----------------------------------------------
      // PRODUCT PERFORMANCE
      // ----------------------------------------------

      if (
        business.product_performance
          ?.length
      ) {
        addSectionTitle(
          '4. Product Performance'
        )

        addTable({
          head: [
            [
              'Product',
              'Total sales'
            ]
          ],

          body:
            business.product_performance.map(
              (item) => [
                String(item.name),
                formatNumber(
                  item.sales
                )
              ]
            )
        })
      }

      // ----------------------------------------------
      // REGIONAL PERFORMANCE
      // ----------------------------------------------

      if (
        business.region_performance
          ?.length
      ) {
        addSectionTitle(
          '5. Regional Performance'
        )

        addTable({
          head: [
            [
              'Region',
              'Total sales'
            ]
          ],

          body:
            business.region_performance.map(
              (item) => [
                String(item.name),
                formatNumber(
                  item.sales
                )
              ]
            )
        })
      }

      // ----------------------------------------------
      // CATEGORICAL SUMMARY
      // ----------------------------------------------

      if (
        Object.keys(
          categoricalSummary
        ).length
      ) {
        addSectionTitle(
          '6. Categorical Summary'
        )

        Object.entries(
          categoricalSummary
        ).forEach(
          ([columnName, values]) => {
            addPageIfNeeded(20)

            addParagraph(
              `Column: ${columnName}`
            )

            const rows = (
              values || []
            ).map((item) => [
              String(
                item.value ??
                  '—'
              ),
              formatNumber(
                item.count
              )
            ])

            if (rows.length) {
              addTable({
                head: [
                  [
                    'Value',
                    'Count'
                  ]
                ],
                body: rows
              })
            }
          }
        )
      }

      // ----------------------------------------------
      // CHART DATA
      // ----------------------------------------------

      if (charts.length) {
        addSectionTitle(
          '7. Chart Data'
        )

        charts.forEach(
          (item) => {
            addPageIfNeeded(22)

            doc.setFont(
              'helvetica',
              'bold'
            )

            doc.setFontSize(10)

            doc.text(
              String(
                item.title ||
                  'Chart'
              ),
              margin,
              y
            )

            y += 5

            const chartRows = (
              item.data || []
            ).map(
              (point) => [
                String(
                  point.category ??
                    point.name ??
                    point.x ??
                    '—'
                ),
                formatNumber(
                  point.value ??
                    point.count ??
                    point.sales ??
                    point.y
                )
              ]
            )

            if (chartRows.length) {
              addTable({
                head: [
                  [
                    'Category / Range',
                    'Value / Count'
                  ]
                ],
                body: chartRows
              })
            }
          }
        )
      }

      // ----------------------------------------------
      // RECOMMENDATIONS
      // ----------------------------------------------

      if (
        recommendations.length
      ) {
        addSectionTitle(
          '8. Recommended Actions'
        )

        recommendations.forEach(
          (
            recommendation,
            index
          ) => {
            addParagraph(
              `${index + 1}. ${recommendation}`
            )
          }
        )
      }

      // ----------------------------------------------
      // DATASET PREVIEW
      // ----------------------------------------------

      if (
        profile.preview?.length
      ) {
        addSectionTitle(
          '9. Dataset Preview'
        )

        const columns =
          profile.column_names ||
          []

        if (columns.length) {
          addTable({
            head: [columns],

            body:
              profile.preview.map(
                (row) =>
                  columns.map(
                    (column) => {
                      const value =
                        row[column]

                      return value ===
                          null ||
                        value ===
                          undefined
                        ? '—'
                        : String(value)
                    }
                  )
              ),

            styles: {
              fontSize: 6.5,
              cellPadding: 2,
              overflow:
                'linebreak'
            }
          })
        }
      }

      // ----------------------------------------------
      // FOOTERS
      // ----------------------------------------------

      const pageCount =
        doc.internal.getNumberOfPages()

      for (
        let page = 1;
        page <= pageCount;
        page++
      ) {
        doc.setPage(page)

        doc.setFont(
          'helvetica',
          'normal'
        )

        doc.setFontSize(8)

        doc.setTextColor(
          120,
          120,
          120
        )

        doc.text(
          'Generated by InsightAI - AI Data Analyst',
          margin,
          pageHeight - 8
        )

        doc.text(
          `Page ${page} of ${pageCount}`,
          pageWidth - margin,
          pageHeight - 8,
          {
            align: 'right'
          }
        )
      }

      // ----------------------------------------------
      // SAVE PDF
      // ----------------------------------------------

      doc.save(
        `${reportName}-report.pdf`
      )

      setSuccess(
        'PDF report downloaded successfully.'
      )

      setError('')
    } catch (err) {
      console.error(
        'PDF report generation failed:',
        err
      )

      setError(
        'Could not generate the PDF report. Check the browser console for details.'
      )
    }
  }

  async function downloadExcelReport() {
    if (!profile?.dataset_id || excelDownloadBusy) {
      if (!profile?.dataset_id) {
        setError(
          'Upload a CSV or Excel file before downloading a report.'
        )
      }
      return
    }

    setExcelDownloadBusy(true)
    setError('')
    setSuccess('')

    try {
      const datasetId = profile.dataset_id
      const response = await fetch(
        `${API}/api/report/excel/${datasetId}`
      )

      if (!response.ok) {
        let message = 'Excel report download failed.'
        try {
          const result = await response.json()
          message = result.detail || message
        } catch {
          // Keep the download error message when the response is not JSON.
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      downloadBlob(
        blob,
        `InsightAI_Report_${datasetId}.xlsx`
      )
      setSuccess('Excel report downloaded successfully.')
    } catch (err) {
      console.error('Excel report download failed:', err)
      setError(
        err.message || 'Could not download the Excel report.'
      )
    } finally {
      setExcelDownloadBusy(false)
    }
  }

  // ------------------------------------------------
  // RESET DASHBOARD
  // ------------------------------------------------

  function resetDashboard() {
    setProfile(null)
    setChart(null)
    setAnalytics(null)
    setAnswers([])
    setFileName('')
    setQuestion('')
    setError('')
    setSuccess('')
    setCleaningPreview(null)
    setCleaningApplied(false)
    setCleaningOptions({
      remove_duplicates: false,
      fill_missing: {},
      drop_columns: [],
      convert_types: {},
      outliers: {}
    })
  }

  const kpis = analytics?.kpis

  const business =
    analytics?.business_insights || {}

  const advancedInsights =
    analytics?.advanced_insights || {}

  const businessInsights =
    buildBusinessInsights(
      analytics,
      profile
    )

  const recommendations =
    business.recommendations || []

  // ------------------------------------------------
  // UI
  // ------------------------------------------------

  return (
    <div className="layout">
      <style>{`
        .kpi-hover-card:hover,
        .insight-hover-card:hover,
        .advanced-hover-card:hover,
        .recommendation-hover-card:hover {
          border-color: #686bef !important;
          background: linear-gradient(145deg, #f1f1ff 0%, #ffffff 78%) !important;
          box-shadow: 0 10px 28px rgba(104, 107, 239, 0.12) !important;
        }
        .nav:hover,
        .nav.active:hover {
          background: #686bef;
          color: #fff;
        }
        .quality-item:hover,
        .cleaning-column:hover,
        .column:hover,
        .answer-card:hover,
        .chart-control:hover,
        .suggestions button:hover {
          border-color: #686bef !important;
          background: linear-gradient(145deg, #f1f1ff 0%, #ffffff 78%) !important;
          box-shadow: 0 10px 28px rgba(104, 107, 239, 0.12) !important;
        }
        .layout select:hover {
          border-color: #686bef !important;
          box-shadow: 0 0 0 2px rgba(104, 107, 239, 0.12);
        }
        .layout select option:hover {
          background: #686bef;
          color: #fff;
        }
        .insight-hover-card:hover {
          border-left-color: #686bef !important;
        }
        .kpi-hover-card:hover .metric-icon {
          background: #686bef !important;
          color: #fff !important;
        }
        .kpi-hover-card:hover strong {
          color: #3f42bd !important;
        }
      `}</style>
      <aside className="sidebar">
        <a
          className="brand"
          href="#data-overview"
          style={{ cursor: 'pointer', textDecoration: 'none' }}
          onClick={() => setSelectedNavigation('Data overview')}
        >
          <div className="logo">
            <Sparkles />
          </div>

          <div>
            <b>InsightAI</b>
            <small>DATA ANALYST</small>
          </div>
        </a>

        <p className="nav-label">
          WORKSPACE
        </p>

        <a
          className={`nav${selectedNavigation === 'Data overview' ? ' active' : ''}`}
          href="#data-overview"
          style={{ textDecoration: 'none' }}
          onClick={() => setSelectedNavigation('Data overview')}
        >
          <Database size={18} />
          Data overview
        </a>

        <a
          className={`nav${selectedNavigation === 'Ask your data' ? ' active' : ''}`}
          href="#ask-your-data"
          style={{ textDecoration: 'none' }}
          onClick={() => setSelectedNavigation('Ask your data')}
        >
          <MessageSquare size={18} />
          Ask your data
        </a>

        {uploadedDatasets.length > 0 && (
          <a
            className={`nav${selectedNavigation === 'Data Comparison' ? ' active' : ''}`}
            href="#data-comparison"
            style={{ textDecoration: 'none' }}
            onClick={() => setSelectedNavigation('Data Comparison')}
          >
            <Rows3 size={18} />
            Data Comparison
          </a>
        )}

        <div className="side-bottom">
          <span />
          Local analysis engine{' '}
          <b>Ready</b>
        </div>
      </aside>

      <main className="main" id="data-overview">
        <header className="header">
          <div>
            <div className="eyebrow">
              YOUR WORKSPACE / ANALYTICS
            </div>

            <h1>AI Data Analyst</h1>

            <p>
              Turn raw data into clear,
              actionable insights.
            </p>
          </div>

          <div className="header-actions">
            {profile && (
              <>
                <button
                  className="secondary-btn"
                  onClick={
                    downloadReport
                  }
                  disabled={busy}
                  title="Download the complete JSON analysis"
                >
                  <Download
                    size={17}
                  />
                  Download JSON
                </button>

                <button
                  className="secondary-btn"
                  onClick={
                    downloadPdfReport
                  }
                  disabled={busy}
                  title="Download the formatted PDF analysis report"
                >
                  <FileSpreadsheet
                    size={17}
                  />
                  Download PDF
                </button>

                <button
                  className="secondary-btn"
                  onClick={downloadExcelReport}
                  disabled={busy || excelDownloadBusy}
                  title="Download the Excel analysis report"
                >
                  <FileSpreadsheet size={17} />
                  {excelDownloadBusy
                    ? 'Downloading Excel…'
                    : 'Download Excel'}
                </button>
              </>
            )}

            <label className="upload-btn">
              <Upload size={17} />

              {busy
                ? 'Working…'
                : 'Upload CSV/Excel'}

              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(e) => {
                  upload(
                    e.target.files?.[0]
                  )

                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </header>

        {error && (
          <div className="error">
            <AlertTriangle
              size={18}
            />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="success-message">
            <CheckCircle2
              size={18}
            />
            <span>{success}</span>
          </div>
        )}

        {!profile ? (
          <section className="welcome">
            <div className="hero">
              <FileSpreadsheet
                size={34}
              />
            </div>

            <div className="eyebrow">
              START WITH YOUR DATA
            </div>

            <h2>
              Make your data
              <br />
              <span>
                make sense.
              </span>
            </h2>

            <p>
              Upload a CSV or Excel file to profile
              your dataset, inspect
              data quality, generate
              charts, and ask
              questions in plain
              English.
            </p>

            <label className="drop">
              <div className="drop-icon">
                <Upload />
              </div>

              <b>
                {busy
                  ? 'Uploading and analyzing your CSV/Excel…'
                  : 'Choose a CSV or Excel file to get started'}
              </b>

              <span>
                Click to browse ·
                Maximum 15 MB
              </span>

              <input
                type="file"
               accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(e) => {
                  upload(
                    e.target.files?.[0]
                  )

                  e.target.value = ''
                }}
              />
            </label>

            <div className="privacy">
              <CheckCircle2
                size={15}
              />

              CSV and Excel analysis runs on
              your local backend. AI
              questions send relevant
              dataset context to Groq.
              Avoid uploading
              confidential data.
            </div>
          </section>
        ) : (
          <>
            {/* FILE BANNER */}

            <div className="file-banner">
              <a
                className="file-icon"
                href="#data-overview"
                style={{ cursor: 'pointer', textDecoration: 'none' }}
                onClick={() => setSelectedNavigation('Data overview')}
              >
                <FileSpreadsheet />
              </a>

              <div className="file-details">
                <b>{fileName}</b>

                <small>
                  CSV or Excel dataset · analysis
                  complete
                </small>
              </div>

              <span className="ready">
                ● Ready
              </span>

              <button
                className="icon-btn"
                title="Upload another file"
                onClick={
                  resetDashboard
                }
                disabled={busy}
              >
                <RefreshCw
                  size={17}
                />
              </button>
            </div>

            <section className="panel">
              <div className="panel-head" style={{ marginBottom: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">DATASET OVERVIEW</div>
                  <h3>Dataset Analysis Overview</h3>
                  <p
                    className="muted"
                    style={{ marginBottom: '4px' }}
                  >
                    {fileName}
                  </p>
                  <p className="muted" style={{ margin: 0 }}>
                    Review key performance metrics, data quality, and business
                    insights.
                  </p>
                </div>
                <span className="tag">Analysis Complete</span>
              </div>
            </section>

            {/* DATA QUALITY METRICS */}

            <section className="metrics">
              <Metric
                icon={<Rows3 />}
                label="Total rows"
                polished
                hoverHighlight
                iconTarget="raw-data"
                onIconClick={() => setSelectedNavigation('Data overview')}
                value={formatNumber(
                  profile.rows
                )}
                detail="Records in dataset"
              />

              <Metric
                icon={<Columns3 />}
                label="Total columns"
                polished
                hoverHighlight
                iconTarget="data-quality"
                onIconClick={() => setSelectedNavigation('Data overview')}
                value={formatNumber(
                  profile.columns_count
                )}
                detail="Available fields"
              />

              <Metric
                icon={
                  profile.missing_cells === 0
                    ? <CheckCircle2 />
                    : <AlertTriangle />
                }
                label="Missing cells"
                polished
                hoverHighlight
                iconTarget="data-quality"
                onIconClick={() => setSelectedNavigation('Data overview')}
                qualityStatus={
                  profile.missing_cells === 0
                    ? 'good'
                    : 'warning'
                }
                value={formatNumber(
                  profile.missing_cells
                )}
                detail={
                  profile.missing_cells
                    ? 'Review data quality'
                    : 'No missing values'
                }
              />

              <Metric
                icon={
                  profile.duplicate_rows === 0
                    ? <CheckCircle2 />
                    : <RefreshCw />
                }
                label="Duplicate rows"
                polished
                hoverHighlight
                iconTarget="data-quality"
                onIconClick={() => setSelectedNavigation('Data overview')}
                qualityStatus={
                  profile.duplicate_rows === 0
                    ? 'good'
                    : 'warning'
                }
                value={formatNumber(
                  profile.duplicate_rows
                )}
                detail="Exact duplicate records"
              />
            </section>

            {/* ADVANCED DATA CLEANING */}

            <section className="panel cleaning-panel">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">
                    DATA QUALITY & CLEANING
                  </div>
                  <h3>Review and clean your dataset</h3>
                  <p className="muted">
                    Preview changes before applying them. Your uploaded
                    data stays unchanged until you apply cleaning.
                  </p>
                </div>
                <div className="cleaning-actions">
                  {cleaningApplied && (
                    <>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={downloadCleanedCsv}
                        disabled={cleaningBusy}
                      >
                        <Download size={15} />
                        Download cleaned CSV
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={resetCleaning}
                        disabled={cleaningBusy}
                      >
                        Reset cleaning
                      </button>
                    </>
                  )}
                </div>
              </div>

              {profile.quality && (
                <div className="quality-summary">
                  {[
                    {
                      label: 'Missing values',
                      issue: profile.quality.missing_values
                    },
                    {
                      label: 'Duplicate rows',
                      issue: {
                        count: profile.quality.duplicate_rows
                      }
                    },
                    {
                      label: 'Outlier values',
                      issue: profile.quality.outliers
                    },
                    {
                      label: 'Type inconsistencies',
                      issue: profile.quality.type_issues
                    },
                    {
                      label: 'Category variations',
                      issue: profile.quality.inconsistent_categories
                    }
                  ].map(({ label, issue }) => (
                    <div className="quality-item" key={label}>
                      <span>{label}</span>
                      <b>{formatNumber(issue?.count ?? 0)}</b>
                      {issue?.columns &&
                        Object.keys(issue.columns).length > 0 && (
                          <small>
                            {Object.entries(issue.columns)
                              .map(([column, count]) => `${column} (${count})`)
                              .join(', ')}
                          </small>
                        )}
                    </div>
                  ))}
                </div>
              )}

              <div className="cleaning-controls">
                <label className="cleaning-duplicate">
                  <input
                    type="checkbox"
                    checked={cleaningOptions.remove_duplicates}
                    onChange={(event) =>
                      updateCleaningOptions((current) => ({
                        ...current,
                        remove_duplicates: event.target.checked
                      }))
                    }
                  />
                  Remove duplicate rows
                </label>

                <div className="cleaning-column-list">
                  {profile.columns.map((column) => {
                    const numeric =
  /int|float|double|number/i.test(column.dtype)

const datetime =
  /datetime|date|time/i.test(column.dtype)

const canUseMeanMedian =
  numeric || datetime

                    return (
                      <div className="cleaning-column" key={column.name}>
                        <b title={column.name}>{column.name}</b>

                        <label>
                          <span>Missing values</span>
                          <select
                            value={
                              cleaningOptions.fill_missing[column.name]
                                ?.strategy || 'keep'
                            }
                            onChange={(event) =>
                              updateCleaningOptions((current) => ({
                                ...current,
                                fill_missing: {
                                  ...current.fill_missing,
                                  [column.name]: {
                                    ...current.fill_missing[column.name],
                                    strategy: event.target.value
                                  }
                                }
                              }))
                            }
                          >
                            <option value="keep">Keep</option>
                            <option value="mean" disabled={!canUseMeanMedian}>
  Fill with mean
</option>

<option value="median" disabled={!canUseMeanMedian}>
  Fill with median
</option>
                            <option value="mode">Fill with mode</option>
                            <option value="constant">Fill with value</option>
                            <option value="drop_rows">Drop rows</option>
                          </select>
                        </label>

                        {cleaningOptions.fill_missing[column.name]
                          ?.strategy === 'constant' && (
                          <input
                            className="cleaning-constant"
                            value={
                              cleaningOptions.fill_missing[column.name]
                                ?.value ?? ''
                            }
                            aria-label={`Fill value for ${column.name}`}
                            placeholder="Value for missing cells"
                            onChange={(event) =>
                              updateCleaningOptions((current) => ({
                                ...current,
                                fill_missing: {
                                  ...current.fill_missing,
                                  [column.name]: {
                                    ...current.fill_missing[column.name],
                                    value: event.target.value
                                  }
                                }
                              }))
                            }
                          />
                        )}

                        <label>
                          <span>Convert type</span>
                          <select
                            value={
                              cleaningOptions.convert_types[column.name] ||
                              'keep'
                            }
                            onChange={(event) =>
                              updateCleaningOptions((current) => ({
                                ...current,
                                convert_types: {
                                  ...current.convert_types,
                                  [column.name]:
                                    event.target.value === 'keep'
                                      ? undefined
                                      : event.target.value
                                }
                              }))
                            }
                          >
                            <option value="keep">Keep current</option>
                            <option value="text">Text</option>
                            <option value="numeric">Numeric</option>
                            <option value="integer">Integer</option>
                            <option value="datetime">Date / time</option>
                            <option value="category">Category</option>
                          </select>
                        </label>

                        {numeric && (
                          <label>
                            <span>Outliers</span>
                            <select
                              value={
                                cleaningOptions.outliers[column.name] ||
                                'keep'
                              }
                              onChange={(event) =>
                                updateCleaningOptions((current) => ({
                                  ...current,
                                  outliers: {
                                    ...current.outliers,
                                    [column.name]: event.target.value
                                  }
                                }))
                              }
                            >
                              <option value="keep">Keep</option>
                              <option value="cap">Cap at IQR limits</option>
                              <option value="remove">Remove rows</option>
                            </select>
                          </label>
                        )}

                        <label className="cleaning-drop">
                          <input
                            type="checkbox"
                            checked={cleaningOptions.drop_columns.includes(
                              column.name
                            )}
                            onChange={(event) =>
                              updateCleaningOptions((current) => ({
                                ...current,
                                drop_columns: event.target.checked
                                  ? [
                                      ...current.drop_columns,
                                      column.name
                                    ]
                                  : current.drop_columns.filter(
                                      (name) => name !== column.name
                                    )
                              }))
                            }
                          />
                          Drop this column
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="cleaning-actions cleaning-footer">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={previewCleaning}
                  disabled={cleaningBusy}
                >
                  {cleaningBusy ? 'Working…' : 'Preview changes'}
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={applyCleaning}
                  disabled={cleaningBusy || !cleaningPreview}
                >
                  Apply cleaning
                </button>
              </div>

              {cleaningPreview && (
                <div className="cleaning-preview">
                  <b>Preview only — changes are not applied yet</b>
                  <p className="muted">
                    {formatNumber(cleaningPreview.changes.rows_before)} rows
                    before · {formatNumber(cleaningPreview.changes.rows_after)}{' '}
                    rows after ·{' '}
                    {formatNumber(cleaningPreview.changes.rows_removed)} rows
                    removed
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {cleaningPreview.profile.column_profiles.map(
                            (column) => (
                              <th key={column.name}>{column.name}</th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {cleaningPreview.preview.map((row, index) => (
                          <tr key={index}>
                            {cleaningPreview.profile.column_profiles.map(
                              (column) => (
                               <td key={column.name}>
  {row[column.name] == null ||
row[column.name] === '' ||
row[column.name] === 'NaT' ||
row[column.name] === 'NaN'
  ? '—'
  : /datetime|date|time/i.test(column.dtype)
    ? typeof row[column.name] === 'number' &&
      Math.abs(row[column.name]) > 100000000000
      ? new Date(
          row[column.name] / 1000000
        ).toISOString().slice(0, 10)
      : String(row[column.name]).slice(0, 10)
    : row[column.name]}
</td>
                              )
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* BUSINESS KPI CARDS */}

            <section className="panel analytics-overview" id="business-performance">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">
                    BUSINESS PERFORMANCE
                  </div>

                  <h3>
                    Key performance
                    indicators
                  </h3>
                </div>

                <span className="tag">
                  LIVE DATA
                </span>
              </div>

              {kpis ? (
                <div className="metrics">
                  {kpis.total_sales !==
                    undefined && (
                    <Metric
                      icon={
                        <DollarSign />
                      }
                      label="Total Sales"
                      polished
                      hoverHighlight
                      iconTarget="business-performance"
                      onIconClick={() => setSelectedNavigation('Data overview')}
                      value={formatNumber(
                        kpis.total_sales
                      )}
                      detail="Sales across all records"
                    />
                  )}

                  {kpis.total_profit !==
                    undefined && (
                    <Metric
                      icon={
                        <TrendingUp />
                      }
                      label="Total Profit"
                      hoverHighlight
                      iconTarget="business-performance"
                      onIconClick={() => setSelectedNavigation('Data overview')}
                      value={formatNumber(
                        kpis.total_profit
                      )}
                      detail="Combined recorded profit"
                    />
                  )}

                  {kpis.average_sales !==
                    undefined && (
                    <Metric
                      icon={
                        <ShoppingCart />
                      }
                      label="Average Sales"
                      polished
                      hoverHighlight
                      iconTarget="business-performance"
                      onIconClick={() => setSelectedNavigation('Data overview')}
                      value={formatNumber(
                        kpis.average_sales
                      )}
                      detail="Average sales per record"
                    />
                  )}

                  {kpis.average_quantity !==
                    undefined && (
                    <Metric
                      icon={
                        <Package />
                      }
                      label="Average Quantity"
                      polished
                      hoverHighlight
                      iconTarget="business-performance"
                      onIconClick={() => setSelectedNavigation('Data overview')}
                      value={formatNumber(
                        kpis.average_quantity
                      )}
                      detail="Average units per record"
                    />
                  )}

                  <Metric
                    icon={
                      <TrendingUp />
                    }
                    label="Profit Margin"
                    polished
                    hoverHighlight
                    iconTarget="business-performance"
                    onIconClick={() => setSelectedNavigation('Data overview')}
                    value={
                      business.profit_margin == null
                        ? '—%'
                        : `${formatNumber(
                            business.profit_margin
                          )}%`
                    }
                    detail="Profit as a share of sales"
                  />
                </div>
              ) : (
                <p className="muted">
                  General dataset analysis
                  is available. Business
                  KPIs appear when
                  compatible numeric
                  columns are detected.
                </p>
              )}
            </section>

            {/* BUSINESS INSIGHTS */}

            {businessInsights.length >
              0 && (
              <section className="panel business-insights" id="business-insights">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">
                      BUSINESS INSIGHTS
                    </div>

                    <h3>
                      What your data is
                      telling you
                    </h3>
                  </div>

                  <span className="tag">
                    FROM YOUR DATA
                  </span>
                </div>

                <div
                  className="insights-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
                    gap: '12px'
                  }}
                >
                  {businessInsights.map((insight, index) => {
                    const iconTarget = {
                      'Top-performing product': 'product-performance',
                      'Product to review': 'product-performance',
                      'Strongest region': 'region-performance',
                      'Overall sales performance': 'business-performance',
                      'Highest individual sale': 'raw-data',
                      'Profit margin': 'business-performance'
                    }[insight.title] || 'business-insights'
                    const tone =
                      insight.type === 'positive'
                        ? {
                            accent: '#2ca779',
                            border: '#d9f0e6',
                            background: '#f7fcf9',
                            iconBackground: '#e7f7ef',
                            iconColor: '#29976b'
                          }
                        : insight.type === 'attention'
                          ? {
                              accent: '#d6942b',
                              border: '#f2e4c8',
                              background: '#fffcf6',
                              iconBackground: '#fff3d9',
                              iconColor: '#bd7a10'
                            }
                          : {
                              accent: '#686bef',
                              border: '#e4e6fb',
                              background: '#fbfbff',
                              iconBackground: '#efefff',
                              iconColor: '#686bef'
                            }

                    return (
                      <div
                        className={`insight-card insight-hover-card ${insight.type || ''}`}
                        key={`${insight.title}-${index}`}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          minWidth: 0,
                          padding: '15px',
                          border: `1px solid ${tone.border}`,
                          borderLeft: `3px solid ${tone.accent}`,
                          borderRadius: '10px',
                          background: tone.background
                        }}
                      >
                        <a
                          className="insight-icon"
                          href={`#${iconTarget}`}
                          aria-label={`Open ${insight.title} section`}
                          onClick={() => setSelectedNavigation('Data overview')}
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            flex: '0 0 36px',
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: tone.iconBackground,
                            color: tone.iconColor,
                            cursor: 'pointer',
                            textDecoration: 'none'
                          }}
                        >
                          {insight.icon}
                        </a>

                        <div
                          style={{
                            display: 'grid',
                            gap: '6px',
                            minWidth: 0
                          }}
                        >
                          <strong
                            style={{
                              color: '#343b50',
                              fontSize: '12px',
                              lineHeight: 1.4
                            }}
                          >
                            {insight.title}
                          </strong>

                          <p
                            style={{
                              margin: 0,
                              color: '#737d93',
                              fontSize: '11px',
                              lineHeight: 1.65,
                              overflowWrap: 'anywhere'
                            }}
                          >
                            {insight.text}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="advanced-insights" id="advanced-insights">
                  <div className="eyebrow">ADVANCED INSIGHTS</div>
                  <div
                    className="quality-summary"
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                      gap: '12px',
                      margin: '13px 0 0'
                    }}
                  >
                    <div
                      className="quality-item advanced-hover-card"
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7fb',
                        borderRadius: '11px',
                        background: '#fcfcff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '13px' }}>
                        <a href="#business-performance" aria-label="Open business performance" onClick={() => setSelectedNavigation('Data overview')} style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', background: '#efefff', color: '#686bef', cursor: 'pointer', textDecoration: 'none' }}>
                          <Trophy size={16} />
                        </a>
                        <span style={{ color: '#343b50', fontSize: '12px', fontWeight: 700 }}>
                          Top sales category
                        </span>
                      </div>
                      <b style={{ margin: '0 0 5px', color: '#343b50', font: '700 18px Manrope, sans-serif' }}>
                        {advancedInsights.top_sales_category?.category ||
                          'Not available'}
                      </b>
                      <small style={{ color: '#737d93', fontSize: '10px', lineHeight: 1.6 }}>
                        {advancedInsights.top_sales_category?.total_sales == null
                          ? 'Sales: Not available'
                          : `₹${formatNumber(
                              advancedInsights.top_sales_category.total_sales
                            )}`}
                        {' · '}
                        {advancedInsights.top_sales_category
                          ?.percentage_of_total_sales == null
                          ? 'Share: Not available'
                          : `${formatNumber(
                              advancedInsights.top_sales_category
                                .percentage_of_total_sales
                            )}% of total sales`}
                      </small>
                    </div>

                    <div
                      className="quality-item advanced-hover-card"
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7fb',
                        borderRadius: '11px',
                        background: '#fcfcff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '13px' }}>
                        <a href="#region-performance" aria-label="Open regional performance" onClick={() => setSelectedNavigation('Data overview')} style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', background: '#eaf8f1', color: '#29976b', cursor: 'pointer', textDecoration: 'none' }}>
                          <TrendingUp size={16} />
                        </a>
                        <span style={{ color: '#343b50', fontSize: '12px', fontWeight: 700 }}>
                          Regional performance
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                        <div className="advanced-hover-card" style={{ minWidth: 0, padding: '10px', border: '1px solid #d9f0e6', borderRadius: '8px', background: '#f5fcf8' }}>
                          <span style={{ color: '#29976b', fontSize: '9px', fontWeight: 700, letterSpacing: '.6px' }}>BEST</span>
                          <b style={{ margin: '5px 0', color: '#343b50', fontSize: '13px', overflowWrap: 'anywhere' }}>
                            {advancedInsights.best_region?.region ||
                              'Not available'}
                          </b>
                          <small style={{ color: '#737d93', fontSize: '10px' }}>
                            {advancedInsights.best_region?.sales == null
                              ? 'Sales: Not available'
                              : `₹${formatNumber(
                                  advancedInsights.best_region.sales
                                )}`}
                          </small>
                        </div>
                        <div className="advanced-hover-card" style={{ minWidth: 0, padding: '10px', border: '1px solid #f1e4ce', borderRadius: '8px', background: '#fffbf5' }}>
                          <span style={{ color: '#bd7a10', fontSize: '9px', fontWeight: 700, letterSpacing: '.6px' }}>LOWEST</span>
                          <b style={{ margin: '5px 0', color: '#343b50', fontSize: '13px', overflowWrap: 'anywhere' }}>
                            {advancedInsights.lowest_region?.region ||
                              'Not available'}
                          </b>
                          <small style={{ color: '#737d93', fontSize: '10px' }}>
                            {advancedInsights.lowest_region?.sales == null
                              ? 'Sales: Not available'
                              : `₹${formatNumber(
                                  advancedInsights.lowest_region.sales
                                )}`}
                          </small>
                        </div>
                      </div>
                    </div>

                    <div
                      className="quality-item"
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7fb',
                        borderRadius: '11px',
                        background: '#fcfcff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '13px' }}>
                        <a href="#product-performance" aria-label="Open product performance" onClick={() => setSelectedNavigation('Data overview')} style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', background: '#f1edff', color: '#7559c8', cursor: 'pointer', textDecoration: 'none' }}>
                          <Package size={16} />
                        </a>
                        <span style={{ color: '#343b50', fontSize: '12px', fontWeight: 700 }}>
                          Top 2 products
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: '7px', marginBottom: '11px' }}>
                        {advancedInsights.top_2_products?.products?.length ? (
                          advancedInsights.top_2_products.products.map(
                            (product, index) => (
                              <div className="advanced-hover-card" key={`${product.product}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 9px', border: '1px solid #eef0f6', borderRadius: '7px', background: '#fff' }}>
                                <span style={{ minWidth: 0, color: '#515a70', fontSize: '10px', overflowWrap: 'anywhere' }}>
                                  <b style={{ color: '#8c91a3', marginRight: '6px' }}>{index + 1}.</b>
                                  {product.product || 'Not available'}
                                </span>
                                <b style={{ flex: '0 0 auto', color: '#343b50', fontSize: '10px' }}>
                                  {product.sales == null
                                    ? 'Sales not available'
                                    : `₹${formatNumber(product.sales)}`}
                                </b>
                              </div>
                            )
                          )
                        ) : (
                          <small style={{ color: '#737d93', fontSize: '10px' }}>Not available</small>
                        )}
                      </div>
                      <div className="advanced-hover-card">
                        <b style={{ display: 'block', margin: '0 0 4px', color: '#343b50', fontSize: '12px' }}>
                          Combined:{' '}
                          {advancedInsights.top_2_products?.combined_sales ==
                          null
                            ? 'Not available'
                            : `₹${formatNumber(
                                advancedInsights.top_2_products.combined_sales
                              )}`}
                        </b>
                      </div>
                      <div className="advanced-hover-card">
                        <small style={{ color: '#737d93', fontSize: '10px' }}>
                          {advancedInsights.top_2_products
                            ?.percentage_of_total_sales == null
                            ? 'Share: Not available'
                            : `${formatNumber(
                                advancedInsights.top_2_products
                                  .percentage_of_total_sales
                              )}% of total sales`}
                        </small>
                      </div>
                    </div>

                    <div
                      className="quality-item"
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7fb',
                        borderRadius: '11px',
                        background: '#fcfcff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '13px' }}>
                        <a href="#business-performance" aria-label="Open business performance" onClick={() => setSelectedNavigation('Data overview')} style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', background: '#eaf4ff', color: '#4384bb', cursor: 'pointer', textDecoration: 'none' }}>
                          <BarChart3 size={16} />
                        </a>
                        <span style={{ color: '#343b50', fontSize: '12px', fontWeight: 700 }}>
                          Quantity insights
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '7px' }}>
                        <div className="advanced-hover-card" style={{ minWidth: 0, padding: '9px 7px', borderRadius: '7px', background: '#f3f6fb' }}>
                          <small style={{ color: '#838ba0', fontSize: '9px', lineHeight: 1.4 }}>Total</small>
                          <b style={{ margin: '4px 0 0', color: '#343b50', fontSize: '13px', overflowWrap: 'anywhere' }}>
                            {advancedInsights.total_quantity == null
                              ? 'Not available'
                              : formatNumber(advancedInsights.total_quantity)}
                          </b>
                        </div>
                        <div className="advanced-hover-card" style={{ minWidth: 0, padding: '9px 7px', borderRadius: '7px', background: '#f3f6fb' }}>
                          <small style={{ color: '#838ba0', fontSize: '9px', lineHeight: 1.4 }}>Average</small>
                          <b style={{ margin: '4px 0 0', color: '#343b50', fontSize: '13px', overflowWrap: 'anywhere' }}>
                            {advancedInsights.average_quantity == null
                              ? 'Not available'
                              : formatNumber(advancedInsights.average_quantity)}
                          </b>
                        </div>
                        <div className="advanced-hover-card" style={{ minWidth: 0, padding: '9px 7px', borderRadius: '7px', background: '#f3f6fb' }}>
                          <small style={{ color: '#838ba0', fontSize: '9px', lineHeight: 1.4 }}>Highest</small>
                          <b style={{ margin: '4px 0 0', color: '#343b50', fontSize: '13px', overflowWrap: 'anywhere' }}>
                            {advancedInsights.highest_quantity == null
                              ? 'Not available'
                              : formatNumber(advancedInsights.highest_quantity)}
                          </b>
                        </div>
                      </div>
                    </div>

                    <div
                      className="quality-item advanced-hover-card"
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7fb',
                        borderRadius: '11px',
                        background:
                          advancedInsights.missing_cells == null ||
                          advancedInsights.duplicate_rows == null
                            ? '#fcfcff'
                            : advancedInsights.missing_cells === 0 &&
                                advancedInsights.duplicate_rows === 0
                              ? '#f7fcf9'
                              : '#fffcf6'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '13px' }}>
                        <a href="#data-quality" aria-label="Open data quality" onClick={() => setSelectedNavigation('Data overview')} style={{ display: 'grid', placeItems: 'center', width: '32px', height: '32px', borderRadius: '9px', background: '#efefff', color: '#686bef', cursor: 'pointer', textDecoration: 'none' }}>
                          <CheckCircle2 size={16} />
                        </a>
                        <span style={{ color: '#343b50', fontSize: '12px', fontWeight: 700 }}>
                          Data quality snapshot
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '11px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background:
                          advancedInsights.missing_cells == null ||
                          advancedInsights.duplicate_rows == null
                            ? '#9aa2b4'
                            : advancedInsights.missing_cells === 0 &&
                                advancedInsights.duplicate_rows === 0
                              ? '#29976b'
                              : '#bd7a10'
                        }} />
                        <b style={{ margin: 0, color:
                          advancedInsights.missing_cells == null ||
                          advancedInsights.duplicate_rows == null
                            ? '#737d93'
                            : advancedInsights.missing_cells === 0 &&
                                advancedInsights.duplicate_rows === 0
                              ? '#29976b'
                              : '#bd7a10',
                          fontSize: '10px'
                        }}>
                          {advancedInsights.missing_cells == null ||
                          advancedInsights.duplicate_rows == null
                            ? 'Status unavailable'
                            : advancedInsights.missing_cells === 0 &&
                                advancedInsights.duplicate_rows === 0
                              ? 'No missing or duplicate records'
                              : 'Review data quality'}
                        </b>
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <small style={{ color: '#737d93', fontSize: '10px' }}>
                          Missing cells:{' '}
                          {advancedInsights.missing_cells == null
                            ? 'Not available'
                            : formatNumber(advancedInsights.missing_cells)}
                        </small>
                        <small style={{ color: '#737d93', fontSize: '10px' }}>
                          Duplicate rows:{' '}
                          {advancedInsights.duplicate_rows == null
                            ? 'Not available'
                            : formatNumber(advancedInsights.duplicate_rows)}
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* RECOMMENDATIONS */}

            {recommendations.length >
              0 && (
              <section className="panel recommendations" id="decision-support">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">
                      DECISION SUPPORT
                    </div>

                    <h3>
                      Recommended actions
                    </h3>
                  </div>

                  <a
                    href="#decision-support"
                    aria-label="Open decision support"
                    style={{ cursor: 'pointer', color: 'inherit' }}
                    onClick={() => setSelectedNavigation('Data overview')}
                  >
                    <Lightbulb className="purple" />
                  </a>
                </div>

                <div
                  className="recommendation-list"
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(min(100%, 290px), 1fr))',
                    gap: '12px'
                  }}
                >
                  {recommendations.map((recommendation, index) => (
                    <div
                      className="recommendation-hover-card"
                      key={`${recommendation}-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '38px minmax(0, 1fr)',
                        alignItems: 'start',
                        gap: '12px',
                        minWidth: 0,
                        padding: '15px',
                        border: '1px solid #e4e6fb',
                        borderRadius: '10px',
                        background: '#fbfbff'
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          justifyItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <span
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: '34px',
                            height: '34px',
                            borderRadius: '10px',
                            background: '#efefff',
                            color: '#686bef',
                            font: '700 12px Manrope, sans-serif'
                          }}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <a
                          href="#decision-support"
                          aria-label="Open decision support"
                          style={{ cursor: 'pointer', color: 'inherit' }}
                          onClick={() => setSelectedNavigation('Data overview')}
                        >
                          <CheckCircle2
                            size={14}
                            aria-hidden="true"
                            style={{ color: '#8b8ef0' }}
                          />
                        </a>
                      </div>

                      <p
                        style={{
                          margin: '2px 0 0',
                          color: '#414960',
                          fontSize: '12px',
                          fontWeight: 500,
                          lineHeight: 1.7,
                          overflowWrap: 'anywhere'
                        }}
                      >
                        {recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* PRODUCT PERFORMANCE */}

            {business.product_performance
              ?.length > 0 && (
              <section className="panel" id="product-performance">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">
                      PRODUCT BREAKDOWN
                    </div>

                    <h3>
                      Sales by product
                    </h3>
                  </div>

                  <a
                    href="#product-performance"
                    aria-label="Open product performance"
                    style={{ cursor: 'pointer', color: 'inherit' }}
                    onClick={() => setSelectedNavigation('Data overview')}
                  >
                    <Package />
                  </a>
                </div>

                <div className="chart">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={business.product_performance.map(
                        (item) => ({
                          category:
                            item.name,
                          value:
                            item.sales
                        })
                      )}
                      margin={{
                        top: 10,
                        right: 20,
                        left: 5,
                        bottom: 20
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="category"
                        tick={{
                          fontSize: 12
                        }}
                      />

                      <YAxis
                        tick={{
                          fontSize: 11
                        }}
                        tickFormatter={
                          formatNumber
                        }
                      />

                      <Tooltip
                        formatter={(
                          value
                        ) => [
                          formatNumber(
                            value
                          ),
                          'Sales'
                        ]}
                      />

                      <Bar
                        dataKey="value"
                        name="Sales"
                        fill="#686bef"
                        radius={[
                          6,
                          6,
                          0,
                          0
                        ]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* REGION PERFORMANCE */}

            {business.region_performance
              ?.length > 0 && (
              <section className="panel" id="region-performance">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">
                      REGIONAL BREAKDOWN
                    </div>

                    <h3>
                      Sales by region
                    </h3>
                  </div>

                  <a
                    href="#region-performance"
                    aria-label="Open regional performance"
                    style={{ cursor: 'pointer', color: 'inherit' }}
                    onClick={() => setSelectedNavigation('Data overview')}
                  >
                    <TrendingUp />
                  </a>
                </div>

                <div className="chart">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={business.region_performance.map(
                        (item) => ({
                          category:
                            item.name,
                          value:
                            item.sales
                        })
                      )}
                      margin={{
                        top: 10,
                        right: 20,
                        left: 5,
                        bottom: 20
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="category"
                        tick={{
                          fontSize: 12
                        }}
                      />

                      <YAxis
                        tick={{
                          fontSize: 11
                        }}
                        tickFormatter={
                          formatNumber
                        }
                      />

                      <Tooltip
                        formatter={(
                          value
                        ) => [
                          formatNumber(
                            value
                          ),
                          'Sales'
                        ]}
                      />

                      <Bar
                        dataKey="value"
                        name="Sales"
                        fill="#18a999"
                        radius={[
                          6,
                          6,
                          0,
                          0
                        ]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* AUTOMATIC ANALYTICS */}

            {analytics?.charts?.length >
              0 && (
              <section className="analytics-section">
                <SectionTitle
                  eyebrow="VISUAL ANALYTICS"
                  title="Explore your business data"
                  detail="Automatically generated charts based on the uploaded dataset."
                />

                <div
                  className="panel"
                  id="chart-controls"
                  style={{
                    padding: '20px',
                    border: '1px solid #e6e8f3',
                    background:
                      'linear-gradient(135deg, #ffffff 0%, #fafaff 100%)'
                  }}
                >
                  <div className="panel-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <a
                        href="#chart-controls"
                        aria-label="Open chart controls"
                        onClick={() => setSelectedNavigation('Data overview')}
                        style={{
                          display: 'grid',
                          placeItems: 'center',
                          width: '38px',
                          height: '38px',
                          flex: '0 0 38px',
                          borderRadius: '11px',
                          background: '#efefff',
                          color: '#686bef',
                          cursor: 'pointer',
                          textDecoration: 'none'
                        }}
                      >
                        <BarChart3 size={18} />
                      </a>
                      <div>
                        <div className="eyebrow">CHART CONTROLS</div>
                        <h3>Customize your view</h3>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                      gap: '13px'
                    }}
                  >
                    <label
                      className="chart-control"
                      style={{
                        display: 'grid',
                        gap: '7px',
                        minWidth: 0,
                        padding: '13px',
                        border: '1px solid #eceef6',
                        borderRadius: '9px',
                        background: '#fff'
                      }}
                    >
                      <span
                        style={{
                          color: '#515a70',
                          fontSize: '11px',
                          fontWeight: 700
                        }}
                      >
                        Chart Type
                      </span>
                      <small style={{ color: '#9299aa', fontSize: '10px' }}>
                        Choose how to visualize the results.
                      </small>
                      <select
                        value={interactiveChartType}
                        onChange={(event) =>
                          setInteractiveChartType(event.target.value)
                        }
                        aria-label="Chart type"
                        style={{
                          width: '100%',
                          minHeight: '40px',
                          border: '1px solid #dfe2f0',
                          borderRadius: '7px',
                          background: '#fafaff',
                          color: '#343b50',
                          padding: '0 11px',
                          font: '600 12px "DM Sans", sans-serif',
                          outlineColor: '#8b8df2'
                        }}
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="pie">Pie</option>
                      </select>
                    </label>

                    <label
                      className="chart-control"
                      style={{
                        display: 'grid',
                        gap: '7px',
                        minWidth: 0,
                        padding: '13px',
                        border: '1px solid #eceef6',
                        borderRadius: '9px',
                        background: '#fff'
                      }}
                    >
                      <span
                        style={{
                          color: '#515a70',
                          fontSize: '11px',
                          fontWeight: 700
                        }}
                      >
                        Metric / Dimension
                      </span>
                      <small style={{ color: '#9299aa', fontSize: '10px' }}>
                        Select the dataset breakdown to explore.
                      </small>
                      <select
                        value={interactiveDimension}
                        onChange={(event) =>
                          setInteractiveDimension(event.target.value)
                        }
                        aria-label="Metric or dimension"
                        style={{
                          width: '100%',
                          minHeight: '40px',
                          border: '1px solid #dfe2f0',
                          borderRadius: '7px',
                          background: '#fafaff',
                          color: '#343b50',
                          padding: '0 11px',
                          font: '600 12px "DM Sans", sans-serif',
                          outlineColor: '#8b8df2'
                        }}
                      >
                        <option value="region">Sales by Region</option>
                        <option value="category">Sales by Category</option>
                        <option value="product">Sales by Product</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="eyebrow">INTERACTIVE ANALYSIS</div>
                      <h3>{dimensionLabels[interactiveDimension]}</h3>
                    </div>
                  </div>

                  {interactiveChartData.length > 0 ? (
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        {interactiveChartType === 'pie' ? (
                          <PieChart>
                            <Tooltip
                              formatter={(value) => [
                                formatNumber(value),
                                'Sales'
                              ]}
                            />
                            <Legend />
                            <Pie
                              data={interactiveChartData}
                              dataKey="value"
                              nameKey="category"
                              outerRadius="75%"
                            >
                              {interactiveChartData.map((entry, index) => (
                                <Cell
                                  key={`${entry.category}-${index}`}
                                  fill={
                                    [
                                      '#686bef',
                                      '#18a999',
                                      '#f4a261',
                                      '#e76f51',
                                      '#5b8def',
                                      '#a66dd4'
                                    ][index % 6]
                                  }
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        ) : interactiveChartType === 'line' ? (
                          <LineChart data={interactiveChartData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis dataKey="category" />
                            <YAxis tickFormatter={formatNumber} />
                            <Tooltip
                              formatter={(value) => [
                                formatNumber(value),
                                'Sales'
                              ]}
                            />
                            <Line
                              dataKey="value"
                              name="Sales"
                              stroke="#686bef"
                              strokeWidth={2}
                            />
                          </LineChart>
                        ) : (
                          <BarChart data={interactiveChartData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis dataKey="category" />
                            <YAxis tickFormatter={formatNumber} />
                            <Tooltip
                              formatter={(value) => [
                                formatNumber(value),
                                'Sales'
                              ]}
                            />
                            <Bar
                              dataKey="value"
                              name="Sales"
                              fill="#686bef"
                              radius={[5, 5, 0, 0]}
                            />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="muted">
                      No sales data is available for this dimension.
                    </p>
                  )}
                </div>

                <div className="grid analytics-grid">
                  {analytics.charts
                    .filter(
                      (item) =>
                        item.title !== 'Sales by Region' &&
                        item.title !== 'Sales by Product'
                    )
                    .map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        className="panel"
                        key={`${item.title}-${index}`}
                      >
                        <div className="panel-head">
                          <div>
                            <div className="eyebrow">
                              ADDITIONAL ANALYTICS
                            </div>

                            <h3>
                              {item.title}
                            </h3>
                          </div>
                        </div>

                        {item.data?.length >
                        0 ? (
                          <div className="chart">
                            {item.type ===
                            'line' ? (
                              <ResponsiveContainer
                                width="100%"
                                height="100%"
                              >
                                <LineChart
                                  data={
                                    item.data
                                  }
                                  margin={{
                                    top: 10,
                                    right: 15,
                                    left: 0,
                                    bottom: 30
                                  }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                  />

                                  <XAxis
                                    dataKey="category"
                                    tick={{
                                      fontSize: 10
                                    }}
                                    interval="preserveStartEnd"
                                  />

                                  <YAxis
                                    tick={{
                                      fontSize: 11
                                    }}
                                    tickFormatter={
                                      formatNumber
                                    }
                                  />

                                  <Tooltip
                                    formatter={(
                                      value
                                    ) => [
                                      formatNumber(
                                        value
                                      ),
                                      'Value'
                                    ]}
                                    labelFormatter={(
                                      label
                                    ) =>
                                      `Category: ${label}`
                                    }
                                  />

                                  <Line
                                    dataKey="value"
                                    name="Value"
                                    stroke="#686bef"
                                    strokeWidth={
                                      2
                                    }
                                    dot={
                                      false
                                    }
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <ResponsiveContainer
                                width="100%"
                                height="100%"
                              >
                                <BarChart
                                  data={
                                    item.data
                                  }
                                  margin={{
                                    top: 10,
                                    right: 15,
                                    left: 0,
                                    bottom: 30
                                  }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                  />

                                  <XAxis
                                    dataKey="category"
                                    tick={{
                                      fontSize: 10
                                    }}
                                    interval="preserveStartEnd"
                                  />

                                  <YAxis
                                    tick={{
                                      fontSize: 11
                                    }}
                                    allowDecimals={
                                      false
                                    }
                                    tickFormatter={
                                      formatNumber
                                    }
                                  />

                                  <Tooltip
                                    formatter={(
                                      value
                                    ) => [
                                      formatNumber(
                                        value
                                      ),
                                      item.type ===
                                      'histogram'
                                        ? 'Records'
                                        : 'Value'
                                    ]}
                                    labelFormatter={(
                                      label
                                    ) =>
                                      item.type ===
                                      'histogram'
                                        ? `Sales range: ${label}`
                                        : `Category: ${label}`
                                    }
                                  />

                                  <Bar
                                    dataKey="value"
                                    name={
                                      item.type ===
                                      'histogram'
                                        ? 'Records'
                                        : 'Value'
                                    }
                                    fill={
                                      item.type ===
                                      'histogram'
                                        ? '#18a999'
                                        : '#686bef'
                                    }
                                    radius={[
                                      5,
                                      5,
                                      0,
                                      0
                                    ]}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        ) : (
                          <p className="muted">
                            No chart data is
                            available for this
                            view.
                          </p>
                        )}

                        {item.type ===
                          'histogram' && (
                          <p className="muted">
                            Each bar represents
                            the number of records
                            within a sales range.
                          </p>
                        )}
                      </div>
                    )
                  )}
                </div>
              </section>
            )}

            {/* NUMERIC SUMMARY */}

            {Object.keys(
              analytics?.numeric_summary ||
                {}
            ).length > 0 && (
              <section className="panel" id="numeric-summary">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">
                      STATISTICAL SUMMARY
                    </div>

                    <h3>
                      Numeric column
                      statistics
                    </h3>
                  </div>

                  <a
                    href="#numeric-summary"
                    aria-label="Open numeric summary"
                    style={{ cursor: 'pointer', color: 'inherit' }}
                    onClick={() => setSelectedNavigation('Data overview')}
                  >
                    <BarChart3 />
                  </a>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          Column
                        </th>
                        <th>
                          Sum
                        </th>
                        <th>
                          Average
                        </th>
                        <th>
                          Median
                        </th>
                        <th>
                          Minimum
                        </th>
                        <th>
                          Maximum
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {Object.entries(
                        analytics.numeric_summary
                      ).map(
                        ([
                          name,
                          stats
                        ]) => (
                          <tr
                            key={name}
                          >
                            <td>
                              {name}
                            </td>

                            <td>
                              {formatNumber(
                                stats.sum
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                stats.mean
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                stats.median
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                stats.min
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                stats.max
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* AI ANALYST */}

            <section className="panel ask-panel" id="ask-your-data">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">Ask your data</div>

                  <h3>AI Data Analyst</h3>

                  <p className="muted">
                    Ask questions about your uploaded dataset in plain English and get AI-powered insights.
                  </p>
                </div>

                <a
                  className="ask-icon"
                  href="#ask-your-data"
                  aria-label="Open Ask your data"
                  style={{ cursor: 'pointer', textDecoration: 'none' }}
                  onClick={() => setSelectedNavigation('Ask your data')}
                >
                  <Sparkles />
                </a>
              </div>

              <div className="suggestions">
                {[
                  'Give me 3 important insights from this dataset.',
                  'Which region has the highest sales and why?',
                  'Which product should we focus on?',
                  'What are the biggest data quality issues?',
                  'Compare sales across regions.',
                  'Give me 5 business recommendations.'
                ].map((suggestion) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={suggestion}
                    disabled={busy}
                    onClick={() =>
                      setQuestion(
                        suggestion
                      )
                    }
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <form
                className="ask-form"
                onSubmit={ask}
              >
                <input
                  value={question}
                  onChange={(e) =>
                    setQuestion(
                      e.target.value
                    )
                  }
                  placeholder="Ask anything about your data…"
                  disabled={busy}
                  aria-label="Ask a question about your data"
                />

                <button
                  type="submit"
                  disabled={busy || !question.trim()}
                >
                  {busy ? (
                    <RefreshCw
                      size={17}
                    />
                  ) : (
                    <Send
                      size={17}
                    />
                  )}

                  {busy
                    ? 'Analyzing…'
                    : 'Ask AI'}
                </button>
              </form>

              {answers.length > 0 && (
                <div className="answers">
                  <div className="answers-heading">
                    <span>AI ANALYSIS</span>
                    <span>
                      {answers.length} question
                      {answers.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {answers.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        className="answer-card"
                        key={`${item.q}-${index}`}
                      >
                        <div className="question-text">
                          <MessageSquare
                            size={16}
                          />

                          <b>
                            {item.q}
                          </b>
                        </div>

                        <div className="answer-text">
                          <ReactMarkdown
                            remarkPlugins={[
                              remarkGfm
                            ]}
                          >
                            {item.a}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>

            {/* DATA PREVIEW */}

            <section className="panel" id="raw-data">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">
                    RAW DATA
                  </div>

                  <h3>
                    Dataset preview
                  </h3>

                  <p className="muted">
                    Showing up to the
                    first 10 records
                    returned by the
                    backend.
                  </p>
                </div>

                <a
                  href="#raw-data"
                  aria-label="Open raw data"
                  style={{ cursor: 'pointer', color: 'inherit' }}
                  onClick={() => setSelectedNavigation('Data overview')}
                >
                  <Table2 />
                </a>
              </div>

              {profile.preview?.length >
              0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {profile.column_names.map(
                          (
                            column
                          ) => (
                            <th
                              key={
                                column
                              }
                            >
                              {column}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {profile.preview.map(
                        (
                          row,
                          index
                        ) => (
                          <tr
                            key={
                              index
                            }
                          >
                            {profile.column_names.map(
                              (
                                column
                              ) => (
                                <td
                                  key={
                                    column
                                  }
                                >
                                  {row[
                                    column
                                  ] ===
                                    null ||
                                  row[
                                    column
                                  ] ===
                                    undefined
                                    ? '—'
                                    : String(
                                        row[
                                          column
                                        ]
                                      )}
                                </td>
                              )
                            )}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  No preview records
                  available.
                </p>
              )}
            </section>

            {/* DATA QUALITY */}

            <section className="panel" id="data-quality">
              <div className="panel-head">
                <div>
                  <div className="eyebrow">
                    DATA QUALITY
                  </div>

                  <h3>
                    Column profiles
                  </h3>

                  <p className="muted">
                    Missing values and
                    unique-value counts
                    for each column.
                  </p>
                </div>

                <a
                  href="#data-quality"
                  aria-label="Open data quality"
                  style={{ cursor: 'pointer', color: 'inherit' }}
                  onClick={() => setSelectedNavigation('Data overview')}
                >
                  <Database />
                </a>
              </div>

              {profile.columns?.length >
              0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          Column
                        </th>
                        <th>
                          Type
                        </th>
                        <th>
                          Missing
                        </th>
                        <th>
                          Unique
                        </th>
                        <th>
                          Sample values
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {profile.columns.map(
                        (
                          column
                        ) => (
                          <tr
                            key={
                              column.name
                            }
                          >
                            <td>
                              {
                                column.name
                              }
                            </td>

                            <td>
                              {column.dtype ||
                                '—'}
                            </td>

                            <td>
                              {formatNumber(
                                column.missing
                              )}
                            </td>

                            <td>
                              {formatNumber(
                                column.unique
                              )}
                            </td>

                            <td>
                              {(
                                column.sample ||
                                []
                              )
                                .slice(
                                  0,
                                  4
                                )
                                .map(
                                  (
                                    value
                                  ) =>
                                    value ===
                                      null ||
                                    value ===
                                      undefined
                                      ? '—'
                                      : String(
                                          value
                                        )
                                )
                                .join(
                                  ', '
                                )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  No column profiles
                  available.
                </p>
              )}
            </section>
          </>
        )}

        {uploadedDatasets.length > 0 && (
          <section
            className="panel"
            id="data-comparison"
          >
            <div className="panel-head">
              <div>
                <div className="eyebrow">DATA COMPARISON</div>
                <h3>Compare uploaded datasets</h3>
                <p className="muted">
                  Compare verified metrics from datasets already uploaded in
                  this session.
                </p>
              </div>
              <a
                href="#data-comparison"
                aria-label="Open data comparison"
                style={{ cursor: 'pointer', color: 'inherit' }}
                onClick={() => setSelectedNavigation('Data Comparison')}
              >
                <Rows3 className="purple" />
              </a>
            </div>

            <form
              onSubmit={compareUploadedDatasets}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'end',
                gap: '12px',
                marginBottom: '18px'
              }}
            >
              <label style={{ display: 'grid', gap: '6px', flex: '1 1 180px' }}>
                <span className="muted">Dataset 1</span>
                <select
                  value={selectedCompareDataset1}
                  onChange={(event) =>
                    setSelectedCompareDataset1(event.target.value)
                  }
                  required
                  aria-label="Dataset 1"
                >
                  <option value="" disabled>
                    Select a dataset
                  </option>
                  {uploadedDatasets.map((dataset) => (
                    <option
                      key={dataset.dataset_id}
                      value={dataset.dataset_id}
                    >
                      {dataset.filename}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: '6px', flex: '1 1 180px' }}>
                <span className="muted">Dataset 2</span>
                <select
                  value={selectedCompareDataset2}
                  onChange={(event) =>
                    setSelectedCompareDataset2(event.target.value)
                  }
                  required
                  aria-label="Dataset 2"
                >
                  <option value="" disabled>
                    Select a dataset
                  </option>
                  {uploadedDatasets.map((dataset) => (
                    <option
                      key={dataset.dataset_id}
                      value={dataset.dataset_id}
                    >
                      {dataset.filename}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="secondary-btn"
                type="submit"
                disabled={
                  comparisonBusy ||
                  !selectedCompareDataset1 ||
                  !selectedCompareDataset2
                }
              >
                {comparisonBusy ? 'Comparing…' : 'Compare Datasets'}
              </button>
            </form>

            {comparisonError && (
              <div className="error" role="alert">
                <AlertTriangle size={18} />
                <span>{comparisonError}</span>
              </div>
            )}

            {comparison && (
              <>
                <h4>Dataset values</h4>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>{comparison.dataset_1.filename}</th>
                        <th>{comparison.dataset_2.filename}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Rows', 'rows'],
                        ['Columns', 'columns'],
                        ['Missing Cells', 'missing_cells'],
                        ['Duplicate Rows', 'duplicate_rows'],
                        ['Total Sales', 'total_sales'],
                        ['Average Sales', 'average_sales'],
                        ['Total Quantity', 'total_quantity'],
                        ['Average Quantity', 'average_quantity']
                      ].map(([label, key]) => (
                        <tr key={key}>
                          <td>{label}</td>
                          <td>
                            {comparison.dataset_1[key] == null
                              ? 'N/A'
                              : formatNumber(comparison.dataset_1[key])}
                          </td>
                          <td>
                            {comparison.dataset_2[key] == null
                              ? 'N/A'
                              : formatNumber(comparison.dataset_2[key])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h4>Changes (Dataset 2 − Dataset 1)</h4>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Absolute Change</th>
                        <th>Percentage Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Rows', 'rows'],
                        ['Columns', 'columns'],
                        ['Missing Cells', 'missing_cells'],
                        ['Duplicate Rows', 'duplicate_rows'],
                        ['Total Sales', 'total_sales'],
                        ['Average Sales', 'average_sales'],
                        ['Total Quantity', 'total_quantity'],
                        ['Average Quantity', 'average_quantity']
                      ].map(([label, key]) => {
                        const change = comparison.changes[key]
                        const percentage = change.percentage_change

                        return (
                          <tr key={key}>
                            <td>{label}</td>
                            <td>
                              {change.absolute_change == null
                                ? 'N/A'
                                : formatNumber(change.absolute_change)}
                            </td>
                            <td
                              style={{
                                color:
                                  percentage == null
                                    ? '#8790a4'
                                    : percentage > 0
                                      ? '#29976b'
                                      : percentage < 0
                                        ? '#b72b3b'
                                        : '#596277',
                                fontWeight: 600
                              }}
                            >
                              {percentage == null
                                ? 'N/A'
                                : `${percentage > 0 ? '+' : ''}${formatNumber(
                                    percentage
                                  )}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
