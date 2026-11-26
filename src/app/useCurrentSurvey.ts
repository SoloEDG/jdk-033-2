import { computed, onMounted, onUnmounted, ref } from 'vue'
import { TRIAL_START, isWater } from '../features/current/model/bay'
import { createSeedDrifters, newFixId } from '../features/current/model/field'
import { reconstruct, testHoldoutDrifters } from '../features/current/model/reconstruct'
import { createTrial, stepTrial } from '../features/current/model/trial'
import type { CandidateId, Drifter, HoldoutResult, Point, Reconstruction, TrialState } from '../features/current/model/types'

const COLORS = ['#ffb454', '#67d7ff', '#9be564', '#e879f9', '#ff7a7a', '#7c9cff', '#f4e76e']
const FIXED_STEP = 0.04
const TIME_SCALE = 1.15
const MAX_TRIAL_MINUTES = 60

export type MapPickPurpose = 'fix' | 'drifter' | 'trial-start'

export function useCurrentSurvey() {
  const drifters = ref<Drifter[]>(createSeedDrifters())
  const selectedDrifterId = ref('D01')
  const selectedCandidate = ref<CandidateId>('channel')
  const reconstruction = ref<Reconstruction>(reconstruct(drifters.value))
  const holdoutResult = ref<HoldoutResult | null>(testHoldoutDrifters(drifters.value))
  const trialStart = ref<Point>({ ...TRIAL_START })
  const trial = ref<TrialState>(createTrial(selectedCandidate.value, trialStart.value, 268))
  const draft = ref<Point>({ x: 704, y: 307 })
  const pickPurpose = ref<MapPickPurpose | 'inspect'>('inspect')
  const notice = ref('已载入 4 个漂球：D01–D03 参与重建，D04 封存用于独立检验。')
  const dirty = ref(false)

  const fixTime = ref(6)
  const fixX = ref(706)
  const fixY = ref(270)

  const selectedDrifter = computed(() =>
    drifters.value.find(d => d.id === selectedDrifterId.value) ?? drifters.value[0])

  function markDirty(message = '观测已变更，候选结论需要重新核对。') {
    dirty.value = true
    holdoutResult.value = null
    notice.value = message
  }

  function selectDrifter(id: string) {
    selectedDrifterId.value = id
    const drifter = drifters.value.find(d => d.id === id)
    if (!drifter) return
    const last = [...drifter.fixes].sort((a, b) => a.time - b.time).at(-1)
    if (last) {
      fixTime.value = Number((last.time + 6).toFixed(1))
      fixX.value = Math.round(last.position.x)
      fixY.value = Math.round(last.position.y)
      draft.value = { ...last.position }
    }
  }

  selectDrifter(selectedDrifterId.value)

  function armPick(purpose: MapPickPurpose) {
    pickPurpose.value = purpose
    notice.value = purpose === 'drifter'
      ? '在海图上点击入水位置，即可投放新漂球。'
      : purpose === 'trial-start'
        ? '在海图上点击试航起点；船和航迹将使用当前候选流场。'
        : '在海图上点击取样位置，坐标会填入观测表单。'
  }

  function nextDrifterId() {
    const max = drifters.value.reduce((acc, d) => {
      const n = Number.parseInt(d.id.replace(/\D/g, ''), 10)
      return Number.isFinite(n) ? Math.max(acc, n) : acc
    }, 0)
    return `D${String(max + 1).padStart(2, '0')}`
  }

  function addDrifterAt(point: Point, role: Drifter['role'] = 'train') {
    if (!isWater(point)) {
      notice.value = '该点在岸上，漂球不能在陆地入水。'
      return
    }
    const id = nextDrifterId()
    const color = COLORS[(drifters.value.length + 1) % COLORS.length]
    drifters.value.push({
      id,
      name: role === 'holdout' ? `检验球 ${id}` : `自定义球 ${id}`,
      color,
      role,
      enabled: true,
      fixes: [{ id: newFixId(), time: 0, position: { ...point } }],
    })
    selectedDrifterId.value = id
    fixTime.value = 6
    fixX.value = Math.round(point.x)
    fixY.value = Math.round(point.y)
    draft.value = { ...point }
    pickPurpose.value = 'fix'
    markDirty(`${id} 已入水；请按实际观测时刻继续录入位置。`)
  }

  function handleMapPick(point: Point) {
    draft.value = { ...point }
    if (pickPurpose.value === 'drifter') {
      addDrifterAt(point)
      return
    }
    if (pickPurpose.value === 'trial-start') {
      if (!isWater(point)) {
        notice.value = '试航起点不能设在岸上。'
        return
      }
      trialStart.value = { ...point }
      resetTrial()
      pickPurpose.value = 'fix'
      notice.value = '试航起点已更新，地图箭头、侧漂和航迹使用同一候选流场。'
      return
    }
    fixX.value = Math.round(point.x)
    fixY.value = Math.round(point.y)
    notice.value = isWater(point) ? '坐标已取自海图，核对观测时刻后可录入。' : '该坐标位于岸上，不能作为漂球位置。'
  }

  function addFix() {
    const drifter = selectedDrifter.value
    if (!drifter) return
    const time = Number(fixTime.value)
    const x = Number(fixX.value)
    const y = Number(fixY.value)
    if (![time, x, y].every(Number.isFinite)) {
      notice.value = '时刻和坐标必须是数字。'
      return
    }
    if (time < 0) {
      notice.value = '观测时刻不能为负。'
      return
    }
    if (!isWater({ x, y })) {
      notice.value = `(${x}, ${y}) 位于岸上；水不能穿岸，请在水域内选点。`
      return
    }
    if (drifter.fixes.some(f => Math.abs(f.time - time) < 1e-9)) {
      notice.value = `${drifter.id} 在 ${time} 分钟已有观测，请使用不同的实际观测时刻。`
      return
    }
    drifter.fixes.push({ id: newFixId(), time, position: { x, y } })
    drifter.fixes.sort((a, b) => a.time - b.time)
    fixTime.value = Number((time + 6).toFixed(1))
    markDirty(`已按 ${time} 分钟的实际时刻录入 ${drifter.id} 位置，观测间隔可不均匀。`)
  }

  function removeFix(fixId: string) {
    const drifter = selectedDrifter.value
    if (!drifter || drifter.fixes.length <= 1) return
    drifter.fixes = drifter.fixes.filter(f => f.id !== fixId)
    markDirty('观测点已删除，需要重新核对。')
  }

  function removeDrifter(id: string) {
    const index = drifters.value.findIndex(d => d.id === id)
    if (index < 0) return
    drifters.value.splice(index, 1)
    selectedDrifterId.value = drifters.value[Math.max(0, index - 1)]?.id ?? ''
    markDirty('漂球已删除，需要重新核对。')
  }

  function setRole(id: string, role: Drifter['role']) {
    const drifter = drifters.value.find(d => d.id === id)
    if (!drifter) return
    drifter.role = role
    markDirty(role === 'holdout'
      ? `${id} 已封存：不会参与流场重建。`
      : `${id} 已加入重建样本。`)
  }

  function rebuild() {
    reconstruction.value = reconstruct(drifters.value)
    dirty.value = false
    const r = reconstruction.value
    notice.value = r.bothFit
      ? `整段核对完成：A/B 都解释 ${r.evidence.length} 段不均匀观测，已同时保留及分歧水域。`
      : '整段核对完成：只有通过校核的候选可用于解释采样。'
  }

  function runHoldoutCheck() {
    holdoutResult.value = testHoldoutDrifters(drifters.value)
    notice.value = holdoutResult.value.message
  }

  function chooseCandidate(id: CandidateId) {
    selectedCandidate.value = id
    trial.value = createTrial(id, trialStart.value, trial.value.heading)
    notice.value = `已选定${id === 'eddy' ? '候选 A 北部分水' : '候选 B 南槽顺流'}；海图、侧漂分解和航迹均切换到该流场。`
  }

  function resetTrial() {
    trial.value = createTrial(selectedCandidate.value, trialStart.value, trial.value.heading)
  }

  function toggleTrial() {
    if (trial.value.elapsed >= MAX_TRIAL_MINUTES) resetTrial()
    trial.value = { ...trial.value, running: !trial.value.running }
  }

  function setHeading(heading: number) {
    trial.value = { ...trial.value, heading: ((heading % 360) + 360) % 360 }
  }

  let frameId = 0
  let lastTime = 0
  let pending = 0
  function animationFrame(now: number) {
    const realDt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0
    lastTime = now
    if (trial.value.running) {
      pending += realDt * TIME_SCALE
      while (pending >= FIXED_STEP && trial.value.running) {
        pending -= FIXED_STEP
        trial.value = stepTrial(trial.value, FIXED_STEP)
        if (trial.value.elapsed >= MAX_TRIAL_MINUTES) {
          trial.value = { ...trial.value, running: false }
          notice.value = '试航已到 60 分钟上限；可重置后再跑。'
          break
        }
      }
    } else {
      pending = 0
    }
    frameId = requestAnimationFrame(animationFrame)
  }

  onMounted(() => { frameId = requestAnimationFrame(animationFrame) })
  onUnmounted(() => cancelAnimationFrame(frameId))

  return {
    drifters,
    selectedDrifterId,
    selectedDrifter,
    selectedCandidate,
    reconstruction,
    holdoutResult,
    trialStart,
    trial,
    draft,
    pickPurpose,
    notice,
    dirty,
    fixTime,
    fixX,
    fixY,
    selectDrifter,
    armPick,
    handleMapPick,
    addDrifterAt,
    addFix,
    removeFix,
    removeDrifter,
    setRole,
    rebuild,
    runHoldoutCheck,
    chooseCandidate,
    resetTrial,
    toggleTrial,
    setHeading,
  }
}
