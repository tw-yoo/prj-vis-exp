const chartTypes = [
  { id: 'simple', label: 'Bar · Simple', segments: ['bar', 'simple'], ready: false },
  { id: 'stacked', label: 'Bar · Stacked', segments: ['bar', 'stacked'], ready: true },
  { id: 'grouped', label: 'Bar · Grouped', segments: ['bar', 'grouped'], ready: true },
  { id: 'simple', label: 'Line · Simple', segments: ['line', 'simple'], ready: true },
  { id: 'multiple', label: 'Line · Multiple', segments: ['line', 'multiple'], ready: true },
];

const Stage = {
  Idle: 'idle',
  LabelInput: 'labelInput',
  GroupInput: 'groupInput',
  XInput: 'xInput',
  YRangeInput: 'yRangeInput',
  YRangeMinClick: 'yRangeMinClick',
  YRangeMaxClick: 'yRangeMaxClick',
  PointCapture: 'pointCapture',
  ReadyToSave: 'readyToSave',
};

const dom = {
  rootStatus: document.getElementById('rootStatus'),
  pickRootButton: document.getElementById('pickRootButton'),
  chartTypeButtons: document.querySelectorAll('[data-chart-type]'),
  image: document.getElementById('chartImage'),
  markerLayer: document.getElementById('markerLayer'),
  overlayHint: document.getElementById('overlayHint'),
  prevImageButton: document.getElementById('prevImageButton'),
  nextImageButton: document.getElementById('nextImageButton'),
  imageName: document.getElementById('imageName'),
  imageCounter: document.getElementById('imageCounter'),
  currentTask: document.getElementById('currentTask'),
  secondaryStatus: document.getElementById('secondaryStatus'),
  xLabelInput: document.getElementById('xLabelInput'),
  yLabelInput: document.getElementById('yLabelInput'),
  labelsConfirmButton: document.getElementById('labelsConfirmButton'),
  resetLabelsButton: document.getElementById('resetLabelsButton'),
  groupSection: document.getElementById('groupSection'),
  groupLabelInput: document.getElementById('groupLabelInput'),
  groupNamesInput: document.getElementById('groupNamesInput'),
  groupNamesDoneButton: document.getElementById('groupNamesDoneButton'),
  resetGroupsButton: document.getElementById('resetGroupsButton'),
  xModeSwitch: document.getElementById('xModeSwitch'),
  xMinInput: document.getElementById('xMinInput'),
  xMaxInput: document.getElementById('xMaxInput'),
  xValuesInput: document.getElementById('xValuesInput'),
  xValuesDoneButton: document.getElementById('xValuesDoneButton'),
  resetXButton: document.getElementById('resetXButton'),
  yMinInput: document.getElementById('yMinInput'),
  yMaxInput: document.getElementById('yMaxInput'),
  yRangeDoneButton: document.getElementById('yRangeDoneButton'),
  resetYRangeButton: document.getElementById('resetYRangeButton'),
  resetYClicksButton: document.getElementById('resetYClicksButton'),
  precisionSwitch: document.getElementById('precisionSwitch'),
  clickGuide: document.getElementById('clickGuide'),
  valueRows: document.getElementById('valueRows'),
  captureProgress: document.getElementById('captureProgress'),
  resetButton: document.getElementById('resetButton'),
  saveButton: document.getElementById('saveButton'),
};

const chartTypeMap = new Map(chartTypes.map((type) => [type.id, type]));
const XInputMode = {
  Range: 'range',
  Manual: 'manual',
};

const state = {
  rootHandle: null,
  selectedType: null,
  sourceDirByType: new Map(),
  usedDirByType: new Map(),
  csvDirByType: new Map(),
  images: [],
  imageIndex: 0,
  currentImageUrl: '',
  stage: Stage.Idle,
  labels: { x: '', y: '' },
  groups: [],
  currentGroupIndex: 0,
  groupValues: [],
  groupLabel: 'Group',
  stackCursor: { xIndex: 0, groupIndex: 0 },
  xValues: [],
  yRange: {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  },
  yValues: [],
  xInputMode: XInputMode.Range,
  precision: 2,
};

function setStatus(primary, secondary) {
  dom.currentTask.textContent = primary;
  dom.secondaryStatus.textContent = secondary || '';
}

function currentGroupName() {
  return state.groups[state.currentGroupIndex] || '';
}

function isImageFile(name) {
  return /\.(png|jpg|jpeg)$/i.test(name);
}

function isStackedType() {
  return state.selectedType?.id === 'stacked';
}

async function pickRootDirectory() {
  if (typeof window.showDirectoryPicker !== 'function') {
    setStatus('이 브라우저에서는 로컬 디렉토리 접근을 지원하지 않습니다.', 'Chrome 86+ 또는 Edge 86+에서 실행해주세요.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker();
    try {
      await handle.getDirectoryHandle('need_to_convert');
    } catch (err) {
      setStatus('need_to_convert 폴더를 찾을 수 없습니다.', 'ChartQA 루트 폴더를 선택했는지 확인해주세요.');
      state.rootHandle = null;
      return;
    }
    state.rootHandle = handle;
    dom.rootStatus.textContent = `선택됨: ${handle.name}`;
    setStatus('차트 타입을 선택하세요.', 'Line · Simple을 선택하면 변환을 시작할 수 있습니다.');
  } catch (err) {
    setStatus('폴더 선택이 취소되었습니다.', 'ChartQA 루트 폴더를 선택해야 파일을 읽고 쓸 수 있습니다.');
  }
}

async function getDirectoryHandleBySegments(segments, create = false) {
  if (!state.rootHandle) {
    throw new Error('ChartQA 폴더가 선택되지 않았습니다.');
  }
  let handle = state.rootHandle;
  for (const segment of segments) {
    handle = await handle.getDirectoryHandle(segment, { create });
  }
  return handle;
}

async function ensureTypeDirectories(chartType) {
  if (!state.sourceDirByType.has(chartType.id)) {
    const sourceHandle = await getDirectoryHandleBySegments(['need_to_convert', ...chartType.segments]);
    state.sourceDirByType.set(chartType.id, sourceHandle);
  }
  if (!state.usedDirByType.has(chartType.id)) {
    const usedHandle = await getDirectoryHandleBySegments(['used_for_study', ...chartType.segments], true);
    state.usedDirByType.set(chartType.id, usedHandle);
  }
  if (!state.csvDirByType.has(chartType.id)) {
    const csvHandle = await getDirectoryHandleBySegments(['data', 'csv', ...chartType.segments], true);
    state.csvDirByType.set(chartType.id, csvHandle);
  }
}

async function listImagesForType(chartType) {
  await ensureTypeDirectories(chartType);
  const dirHandle = state.sourceDirByType.get(chartType.id);
  const images = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && isImageFile(entry.name)) {
      images.push({ name: entry.name, handle: entry });
    }
  }
  images.sort((a, b) => a.name.localeCompare(b.name));
  return images;
}

function clearMarkers() {
  dom.markerLayer.innerHTML = '';
}

function renderRangeMarkers() {
  if (state.yRange.minPercent) {
    addMarker(state.yRange.minPercent.x, state.yRange.minPercent.y, 'Y min', 'marker--min');
  }
  if (state.yRange.maxPercent) {
    addMarker(state.yRange.maxPercent.x, state.yRange.maxPercent.y, 'Y max', 'marker--max');
  }
}

function clearPointMarkersKeepRange() {
  dom.markerLayer.innerHTML = '';
  renderRangeMarkers();
}

function addMarker(xPercent, yPercent, label, extraClass) {
  const marker = document.createElement('div');
  marker.className = `marker ${extraClass || ''}`.trim();
  marker.style.left = `${xPercent}%`;
  marker.style.top = `${yPercent}%`;
  const labelEl = document.createElement('div');
  labelEl.className = 'marker__label';
  labelEl.textContent = label;
  marker.appendChild(labelEl);
  dom.markerLayer.appendChild(marker);
}

function updateValueTable() {
  dom.valueRows.innerHTML = '';
  if (!state.xValues.length) {
    const row = document.createElement('tr');
    row.className = 'placeholder';
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = '데이터를 입력하면 여기에 표시됩니다.';
    row.appendChild(cell);
    dom.valueRows.appendChild(row);
    dom.captureProgress.textContent = '0 / 0';
    return;
  }

  state.xValues.forEach((x, index) => {
    const row = document.createElement('tr');
    const idxCell = document.createElement('td');
    idxCell.textContent = String(index + 1);
    const xCell = document.createElement('td');
    xCell.textContent = x;
    const yCell = document.createElement('td');
    const value = state.yValues[index];
    yCell.textContent = value === undefined ? '—' : String(value);
    row.append(idxCell, xCell, yCell);
    dom.valueRows.appendChild(row);
  });
  if (state.selectedType?.id === 'multiple' && state.groups.length) {
    const groupName = state.groups[state.currentGroupIndex] || '';
    const filled = state.yValues.filter((v) => v !== undefined).length;
    dom.captureProgress.textContent = `${groupName} (${state.currentGroupIndex + 1}/${
      state.groups.length
    }) · ${filled} / ${state.xValues.length}`;
  } else if (state.selectedType?.id === 'stacked' && state.groups.length) {
    const groupName = state.groups[state.currentGroupIndex] || '';
    const filled = state.yValues.filter((v) => v !== undefined).length;
    dom.captureProgress.textContent = `${groupName} (${state.currentGroupIndex + 1}/${
      state.groups.length
    }) · X ${state.stackCursor.xIndex + 1}/${state.xValues.length} · ${filled} / ${state.xValues.length}`;
  } else if (state.selectedType?.id === 'grouped' && state.groups.length) {
    const groupName = state.groups[state.currentGroupIndex] || '';
    const filled = state.yValues.filter((v) => v !== undefined).length;
    dom.captureProgress.textContent = `${groupName} (${state.currentGroupIndex + 1}/${
      state.groups.length
    }) · X ${state.stackCursor.xIndex + 1}/${state.xValues.length} · ${filled} / ${state.xValues.length}`;
  } else {
    dom.captureProgress.textContent = `${state.yValues.length} / ${state.xValues.length}`;
  }
}

function resetInputsForImage() {
  state.labels = { x: '', y: '' };
  state.groups = [];
  state.groupValues = [];
  state.currentGroupIndex = 0;
  state.groupLabel = 'Group';
  state.stackCursor = { xIndex: 0, groupIndex: 0 };
  state.xValues = [];
  state.yValues = [];
  state.yRange = {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  };
  state.xInputMode = XInputMode.Range;
  state.precision = 2;
  if (state.selectedType && state.images.length) {
    state.stage =
      state.selectedType.id === 'multiple' ||
      state.selectedType.id === 'stacked' ||
      state.selectedType.id === 'grouped'
        ? Stage.GroupInput
        : Stage.LabelInput;
  } else {
    state.stage = Stage.Idle;
  }
  dom.xLabelInput.value = '';
  dom.yLabelInput.value = '';
  dom.xModeSwitch.querySelector('input[value="range"]').checked = true;
  dom.xValuesInput.value = '';
  dom.xMinInput.value = '';
  dom.xMaxInput.value = '';
  dom.yMinInput.value = '';
  dom.yMaxInput.value = '';
  dom.groupNamesInput.value = '';
  dom.groupLabelInput.value = '';
  dom.precisionSwitch.querySelector('input[value=\"2\"]').checked = true;
  toggleGroupSection();
  updateXModeUI();
  clearMarkers();
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function setImageDisplay(record) {
  if (state.currentImageUrl) {
    URL.revokeObjectURL(state.currentImageUrl);
    state.currentImageUrl = '';
  }

  if (!record) {
    dom.image.src = '';
    dom.overlayHint.style.display = 'flex';
    dom.imageName.textContent = '이미지를 불러오세요';
    dom.imageCounter.textContent = '0 / 0';
    return;
  }

  dom.overlayHint.style.display = 'none';
  record.handle
    .getFile()
    .then((file) => {
      const url = URL.createObjectURL(file);
      state.currentImageUrl = url;
      dom.image.src = url;
    })
    .catch((err) => {
      console.error(err);
      setStatus('이미지를 불러올 수 없습니다.', record.name);
    });
  dom.imageName.textContent = record.name;
  dom.imageCounter.textContent = `${state.imageIndex + 1} / ${state.images.length}`;
}

async function loadImagesAndDisplay(chartType) {
  state.images = await listImagesForType(chartType);
  state.imageIndex = 0;
  if (!state.images.length) {
    setStatus('선택한 타입에 남은 이미지가 없습니다.', 'need_to_convert 폴더를 확인해주세요.');
    setImageDisplay(null);
    state.stage = Stage.Idle;
    updateButtonStates();
    return;
  }
  setImageDisplay(state.images[state.imageIndex]);
  resetInputsForImage();
  const primary =
    chartType.id === 'multiple' || chartType.id === 'stacked' || chartType.id === 'grouped'
      ? '그룹을 입력하고 저장하세요.'
      : '라벨을 입력하고 저장하세요.';
  setStatus(primary, `${chartType.label} · ${state.images.length}개 남음`);
}

function setActiveChartButton(chartTypeId) {
  dom.chartTypeButtons.forEach((button) => {
    if (button.dataset.chartType === chartTypeId) {
      button.classList.add('is-active');
    } else {
      button.classList.remove('is-active');
    }
  });
}

function toggleGroupSection() {
  const needsGroup =
    state.selectedType?.id === 'multiple' ||
    state.selectedType?.id === 'stacked' ||
    state.selectedType?.id === 'grouped';
  dom.groupSection.classList.toggle('hidden', !needsGroup);
}

async function handleChartTypeSelect(chartTypeId) {
  const chartType = chartTypeMap.get(chartTypeId);
  if (!chartType) return;
  setActiveChartButton(chartTypeId);

  if (!chartType.ready) {
    state.selectedType = null;
    setStatus(`${chartType.label} 입력은 준비 중입니다.`, 'Line · Simple을 사용해주세요.');
    setImageDisplay(null);
    state.stage = Stage.Idle;
    updateButtonStates();
    return;
  }

  if (!state.rootHandle) {
    setStatus('ChartQA 루트 폴더를 먼저 선택하세요.', '');
    return;
  }

  state.selectedType = chartType;
  toggleGroupSection();
  try {
    await loadImagesAndDisplay(chartType);
  } catch (err) {
    console.error(err);
    setStatus('이미지 목록을 불러오지 못했습니다.', err.message);
  }
}

function updateTaskMessage() {
  const typeLabel = state.selectedType ? state.selectedType.label : '미선택';
  let primary = `선택된 타입: ${typeLabel}`;
  let secondary = '';

  switch (state.stage) {
    case Stage.GroupInput:
      secondary = '그룹 이름을 한 줄에 하나씩 입력하고 "그룹 입력 완료"를 누르세요.';
      break;
    case Stage.Idle:
      secondary = '차트 타입과 이미지를 선택하세요.';
      break;
    case Stage.LabelInput:
      secondary = 'X/Y 라벨을 입력하고 "라벨 저장"을 누르세요.';
      break;
    case Stage.XInput:
      if (state.selectedType?.id === 'multiple' || state.selectedType?.id === 'stacked') {
        secondary = 'X축 값을 입력하세요. 모든 그룹에 동일하게 적용됩니다.';
      } else {
        secondary = 'X축 값을 한 줄에 하나씩 입력한 뒤 "X축 값 입력 완료"를 누르세요.';
      }
      break;
    case Stage.YRangeInput:
      secondary = 'Y축 최소/최대 값을 적은 뒤 "범위값 입력 완료"를 누르세요.';
      break;
    case Stage.YRangeMinClick:
      secondary = '차트 이미지에서 Y축 최소 지점을 클릭하세요.';
      break;
    case Stage.YRangeMaxClick:
      secondary = '차트 이미지에서 Y축 최대 지점을 클릭하세요.';
      break;
    case Stage.PointCapture: {
      if (state.selectedType?.id === 'multiple' && state.groups.length) {
        const targetIndex = nextIndexForCurrentGroup();
        const targetX = state.xValues[targetIndex] || '';
        secondary = `그룹 "${currentGroupName()}" (${state.currentGroupIndex + 1}/${
          state.groups.length
        }) · "${targetX}" 위치를 클릭하세요. (${targetIndex + 1}/${state.xValues.length})`;
      } else if (state.selectedType?.id === 'stacked' && state.groups.length) {
        const { xIndex, groupIndex } = state.stackCursor;
        const targetX = state.xValues[xIndex] || '';
        secondary = `그룹 "${state.groups[groupIndex] || ''}" (${groupIndex + 1}/${
          state.groups.length
        }) · "${targetX}" 위치를 클릭하세요. (X ${xIndex + 1}/${state.xValues.length})`;
      } else if (state.selectedType?.id === 'grouped' && state.groups.length) {
        const { xIndex, groupIndex } = state.stackCursor;
        const targetX = state.xValues[xIndex] || '';
        secondary = `그룹 "${state.groups[groupIndex] || ''}" (${groupIndex + 1}/${
          state.groups.length
        }) · "${targetX}" 위치를 클릭하세요. (X ${xIndex + 1}/${state.xValues.length})`;
      } else {
        const targetIndex = state.yValues.length;
        const targetX = state.xValues[targetIndex] || '';
        secondary = `차트에서 "${targetX}" 위치를 클릭하세요. (${targetIndex + 1}/${state.xValues.length})`;
      }
      break;
    }
    case Stage.ReadyToSave:
      secondary = 'CSV 저장 및 이미지 이동 버튼을 눌러 완료하세요.';
      break;
    default:
      break;
  }

  setStatus(primary, secondary);
}

function updateButtonStates() {
  const hasImage = Boolean(state.images.length);
  dom.labelsConfirmButton.disabled = !(state.stage === Stage.LabelInput && hasImage);
  dom.xValuesDoneButton.disabled = !(state.stage === Stage.XInput);
  dom.yRangeDoneButton.disabled = !(state.stage === Stage.YRangeInput);
  dom.saveButton.disabled = state.stage !== Stage.ReadyToSave;
  dom.prevImageButton.disabled = !hasImage || state.imageIndex === 0;
  dom.nextImageButton.disabled = !hasImage || state.imageIndex >= state.images.length - 1;
  dom.groupNamesDoneButton.disabled = state.stage !== Stage.GroupInput;
}

function parseXValues() {
  const lines = dom.xValuesInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);
  return lines;
}

function parseGroups() {
  const lines = dom.groupNamesInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);
  return lines;
}

function parseGroupLabel() {
  const label = dom.groupLabelInput.value.trim();
  return label || '';
}

function initGroupValues(length) {
  if (!state.groups.length) return;
  state.groupValues = state.groups.map(() => Array(length).fill(undefined));
  state.currentGroupIndex = 0;
  state.stackCursor = { xIndex: 0, groupIndex: 0 };
  state.yValues = state.groupValues[state.currentGroupIndex];
}

function nextIndexForCurrentGroup() {
  if (!state.xValues.length) return 0;
  if (!Array.isArray(state.yValues)) return 0;
  const idx = state.yValues.findIndex((v) => v === undefined);
  return idx === -1 ? state.xValues.length : idx;
}

function updateXModeUI() {
  const isRange = state.xInputMode === XInputMode.Range;
  dom.xMinInput.disabled = !isRange;
  dom.xMaxInput.disabled = !isRange;
  dom.xValuesInput.disabled = isRange;
  dom.xValuesInput.classList.toggle('is-disabled', isRange);
}

function buildRangeXValues() {
  const min = Number(dom.xMinInput.value);
  const max = Number(dom.xMaxInput.value);
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    setStatus('X축 최소/최대는 정수여야 합니다.', '');
    return null;
  }
  if (min >= max) {
    setStatus('X축 최소값은 최대값보다 작아야 합니다.', '');
    return null;
  }
  const values = [];
  for (let v = min; v <= max; v += 1) {
    values.push(String(v));
  }
  return values;
}

function setYRangeClickGuide() {
  if (state.stage === Stage.YRangeMinClick) {
    dom.clickGuide.textContent = '차트 이미지에서 Y축 최소값 위치(시작 지점)를 클릭하세요.';
  } else if (state.stage === Stage.YRangeMaxClick) {
    dom.clickGuide.textContent = '차트 이미지에서 Y축 최대값 위치(끝 지점)를 클릭하세요.';
  } else if (state.stage === Stage.PointCapture) {
    if (state.selectedType?.id === 'stacked' && state.groups.length) {
      const { xIndex, groupIndex } = state.stackCursor;
      const xLabel = state.xValues[xIndex] || '-';
      dom.clickGuide.textContent = `${xLabel} / ${state.groups[groupIndex] || ''} 위치를 클릭하세요. (X ${
        xIndex + 1
      }/${state.xValues.length}, 그룹 ${groupIndex + 1}/${state.groups.length})`;
    } else if (state.selectedType?.id === 'grouped' && state.groups.length) {
      const { xIndex, groupIndex } = state.stackCursor;
      const xLabel = state.xValues[xIndex] || '-';
      dom.clickGuide.textContent = `${xLabel} / ${state.groups[groupIndex] || ''} 위치를 클릭하세요. (X ${
        xIndex + 1
      }/${state.xValues.length}, 그룹 ${groupIndex + 1}/${state.groups.length})`;
    } else {
      const targetIndex = state.selectedType?.id === 'multiple' ? nextIndexForCurrentGroup() : state.yValues.length;
      const xLabel = state.xValues[targetIndex] || '-';
      const groupText =
        state.selectedType?.id === 'multiple' && state.groups.length
          ? ` [${currentGroupName()} - ${state.currentGroupIndex + 1}/${state.groups.length}]`
          : '';
      dom.clickGuide.textContent = `${xLabel} 에 해당하는 위치를 클릭하면 Y 값을 계산합니다.${groupText}`;
    }
  } else {
    dom.clickGuide.textContent = 'y축 범위 값 입력을 끝내면 차트 이미지 위를 클릭해 최소/최대 지점을 지정합니다.';
  }
}

function handleLabelConfirm() {
  if (state.stage !== Stage.LabelInput) {
    return;
  }
  if (
    (state.selectedType?.id === 'multiple' ||
      state.selectedType?.id === 'stacked' ||
      state.selectedType?.id === 'grouped') &&
    !state.groups.length
  ) {
    setStatus('그룹 입력이 먼저 필요합니다.', '그룹을 입력하고 저장하세요.');
    state.stage = Stage.GroupInput;
    updateButtonStates();
    return;
  }
  const xLabel = dom.xLabelInput.value.trim();
  const yLabel = dom.yLabelInput.value.trim();
  if (!xLabel || !yLabel) {
    setStatus('라벨을 모두 입력해야 합니다.', '공백 없이 입력해주세요.');
    return;
  }
  state.labels = { x: xLabel, y: yLabel };
  state.stage = Stage.XInput;
  updateTaskMessage();
  updateButtonStates();
}

function handleGroupConfirm() {
  if (state.stage !== Stage.GroupInput) return;
  const groupLabel = parseGroupLabel();
  if (!groupLabel) {
    setStatus('그룹 컬럼 이름을 입력해야 합니다.', '');
    return;
  }
  const groups = parseGroups();
  if (!groups.length) {
    setStatus('그룹을 한 개 이상 입력해야 합니다.', '');
    return;
  }
  state.groupLabel = groupLabel;
  state.groups = groups;
  state.groupValues = [];
  state.currentGroupIndex = 0;
  state.stackCursor = { xIndex: 0, groupIndex: 0 };
  state.xValues = [];
  state.yValues = [];
  state.yRange = {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  };
  dom.xValuesInput.value = '';
  dom.xMinInput.value = '';
  dom.xMaxInput.value = '';
  dom.yMinInput.value = '';
  dom.yMaxInput.value = '';
  dom.xModeSwitch.querySelector('input[value="range"]').checked = true;
  updateXModeUI();
  clearMarkers();
  updateValueTable();
  state.stage = Stage.LabelInput;
  updateTaskMessage();
  updateButtonStates();
}

function handleXValuesConfirm() {
  if (state.stage !== Stage.XInput) return;
  let values = [];
  if (state.xInputMode === XInputMode.Range) {
    const rangeValues = buildRangeXValues();
    if (!rangeValues || !rangeValues.length) {
      return;
    }
    values = rangeValues;
  } else {
    values = parseXValues();
    if (!values.length) {
      setStatus('X축 값을 한 개 이상 입력해야 합니다.', '');
      return;
    }
  }
  state.xValues = values;
  if (
    state.selectedType?.id === 'multiple' ||
    state.selectedType?.id === 'stacked' ||
    state.selectedType?.id === 'grouped'
  ) {
    initGroupValues(values.length);
    state.yValues = state.groupValues[state.currentGroupIndex];
  } else {
    state.yValues = [];
  }
  state.stage = Stage.YRangeInput;
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function handleYRangeConfirm() {
  if (state.stage !== Stage.YRangeInput) return;
  const minValue = Number(dom.yMinInput.value);
  const maxValue = Number(dom.yMaxInput.value);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    setStatus('Y축 최소/최대 값은 숫자여야 합니다.', '');
    return;
  }
  if (minValue >= maxValue) {
    setStatus('Y축 최소값은 최대값보다 작아야 합니다.', '');
    return;
  }
  state.yRange.minValue = minValue;
  state.yRange.maxValue = maxValue;
  state.yRange.minPixel = null;
  state.yRange.maxPixel = null;
  state.yRange.minPercent = null;
  state.yRange.maxPercent = null;
  state.stackCursor = { xIndex: 0, groupIndex: 0 };
  state.stage = Stage.YRangeMinClick;
  clearMarkers();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function getClickPosition(event) {
  const rect = dom.image.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const xPercent = (x / rect.width) * 100;
  const yPercent = (y / rect.height) * 100;
  return { x, y, xPercent, yPercent };
}

function convertPixelToValue(pixelY) {
  const { minValue, maxValue, minPixel, maxPixel } = state.yRange;
  const span = maxPixel - minPixel;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-6) {
    return null;
  }
  const ratio = (pixelY - minPixel) / span;
  const value = minValue + (maxValue - minValue) * ratio;
  if (!Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(state.precision));
  return Number.isFinite(rounded) ? rounded : null;
}

function handleImageClick(event) {
  if (!state.selectedType || !state.images.length) return;
  const { x, y, xPercent, yPercent } = getClickPosition(event);

  if (state.stage === Stage.YRangeMinClick) {
    state.yRange.minPixel = y;
    state.yRange.minPercent = { x: xPercent, y: yPercent };
    addMarker(xPercent, yPercent, 'Y min', 'marker--min');
    state.stage = Stage.YRangeMaxClick;
    setYRangeClickGuide();
    updateTaskMessage();
    updateButtonStates();
    return;
  }

  if (state.stage === Stage.YRangeMaxClick) {
    state.yRange.maxPixel = y;
    state.yRange.maxPercent = { x: xPercent, y: yPercent };
    addMarker(xPercent, yPercent, 'Y max', 'marker--max');
    state.stage = Stage.PointCapture;
    setYRangeClickGuide();
    updateTaskMessage();
    updateButtonStates();
    return;
  }

  if (state.stage === Stage.PointCapture) {
    if (state.selectedType?.id === 'stacked' && state.groups.length) {
      const { xIndex, groupIndex } = state.stackCursor;
      if (xIndex >= state.xValues.length) return;
      const absoluteValue = convertPixelToValue(y);
      if (!Number.isFinite(absoluteValue)) {
        setStatus('Y 값 계산에 실패했습니다.', 'Y축 최소/최대 클릭이 올바른지 확인해주세요.');
        return;
      }
      const prevSum = state.groupValues
        .slice(0, groupIndex)
        .reduce((sum, arr) => sum + (Number.isFinite(arr[xIndex]) ? arr[xIndex] : 0), 0);
      let value = absoluteValue - prevSum;
      if (!Number.isFinite(value)) {
        setStatus('Y 값 계산에 실패했습니다.', '이전 그룹 값이 올바른지 확인해주세요.');
        return;
      }
      value = Number(value.toFixed(state.precision));
      if (value < 0) value = 0;
      state.groupValues[groupIndex][xIndex] = value;
      state.yValues = state.groupValues[groupIndex];
      addMarker(xPercent, yPercent, `${groupIndex + 1}-${xIndex + 1}`, '');
      updateValueTable();

      let nextX = xIndex;
      let nextGroup = groupIndex;
      if (groupIndex < state.groups.length - 1) {
        nextGroup += 1;
      } else {
        nextGroup = 0;
        nextX += 1;
      }
      if (nextX >= state.xValues.length) {
        state.stage = Stage.ReadyToSave;
      } else {
        state.stackCursor = { xIndex: nextX, groupIndex: nextGroup };
        state.currentGroupIndex = nextGroup;
        state.yValues = state.groupValues[nextGroup];
        updateValueTable();
      }
      setYRangeClickGuide();
      updateTaskMessage();
      updateButtonStates();
      return;
    }

    if (state.selectedType?.id === 'grouped' && state.groups.length) {
      const { xIndex, groupIndex } = state.stackCursor;
      if (xIndex >= state.xValues.length) return;
      const value = convertPixelToValue(y);
      if (!Number.isFinite(value)) {
        setStatus('Y 값 계산에 실패했습니다.', 'Y축 최소/최대 클릭이 올바른지 확인해주세요.');
        return;
      }
      state.groupValues[groupIndex][xIndex] = value;
      state.yValues = state.groupValues[groupIndex];
      addMarker(xPercent, yPercent, `${groupIndex + 1}-${xIndex + 1}`, '');
      updateValueTable();

      let nextX = xIndex;
      let nextGroup = groupIndex;
      if (groupIndex < state.groups.length - 1) {
        nextGroup += 1;
      } else {
        nextGroup = 0;
        nextX += 1;
      }
      if (nextX >= state.xValues.length) {
        state.stage = Stage.ReadyToSave;
      } else {
        state.stackCursor = { xIndex: nextX, groupIndex: nextGroup };
        state.currentGroupIndex = nextGroup;
        state.yValues = state.groupValues[nextGroup];
        updateValueTable();
      }
      setYRangeClickGuide();
      updateTaskMessage();
      updateButtonStates();
      return;
    }

    const targetIndex = state.yValues.length;
    const nextIndex = state.selectedType?.id === 'multiple' ? nextIndexForCurrentGroup() : targetIndex;
    if (nextIndex >= state.xValues.length) return;
    const value = convertPixelToValue(y);
    if (!Number.isFinite(value)) {
      setStatus('Y 값 계산에 실패했습니다.', 'Y축 최소/최대 클릭이 올바른지 확인해주세요.');
      return;
    }
    state.yValues[nextIndex] = value;
    addMarker(xPercent, yPercent, `${nextIndex + 1}`, '');
    updateValueTable();
    if (nextIndexForCurrentGroup() >= state.xValues.length) {
      if (state.selectedType?.id === 'multiple') {
        state.groupValues[state.currentGroupIndex] = [...state.yValues];
        if (state.currentGroupIndex < state.groups.length - 1) {
          state.currentGroupIndex += 1;
          state.yValues =
            state.groupValues[state.currentGroupIndex] ||
            Array(state.xValues.length).fill(undefined);
          state.groupValues[state.currentGroupIndex] = state.yValues;
          clearPointMarkersKeepRange();
          updateValueTable();
          state.stage = Stage.PointCapture;
        } else {
          state.stage = Stage.ReadyToSave;
        }
      } else {
        state.stage = Stage.ReadyToSave;
      }
    }
    setYRangeClickGuide();
    updateTaskMessage();
    updateButtonStates();
  }
}

function resetWorkflow() {
  clearMarkers();
  state.labels = { x: '', y: '' };
  state.groups = [];
  state.groupValues = [];
  state.currentGroupIndex = 0;
  state.groupLabel = 'Group';
  state.stackCursor = { xIndex: 0, groupIndex: 0 };
  state.xValues = [];
  state.yValues = [];
  state.yRange = {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  };
  state.xInputMode = XInputMode.Range;
  state.precision = 2;
  if (state.selectedType && state.images.length) {
    state.stage =
      state.selectedType.id === 'multiple' ||
      state.selectedType.id === 'stacked' ||
      state.selectedType.id === 'grouped'
        ? Stage.GroupInput
        : Stage.LabelInput;
  } else {
    state.stage = Stage.Idle;
  }
  dom.xLabelInput.value = '';
  dom.yLabelInput.value = '';
  dom.xModeSwitch.querySelector('input[value="range"]').checked = true;
  dom.xValuesInput.value = '';
  dom.xMinInput.value = '';
  dom.xMaxInput.value = '';
  dom.yMinInput.value = '';
  dom.yMaxInput.value = '';
  dom.groupNamesInput.value = '';
  dom.groupLabelInput.value = '';
  dom.precisionSwitch.querySelector('input[value="2"]').checked = true;
  toggleGroupSection();
  updateXModeUI();
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function resetGroupsSection() {
  if (!state.selectedType || !state.images.length) {
    return;
  }
  clearMarkers();
  state.groups = [];
  state.groupValues = [];
  state.currentGroupIndex = 0;
  state.groupLabel = 'Group';
  state.stackCursor = { xIndex: 0, groupIndex: 0 };
  state.labels = { x: '', y: '' };
  state.xValues = [];
  state.yValues = [];
  state.yRange = {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  };
  state.xInputMode = XInputMode.Range;
  state.precision = 2;
  state.stage =
    state.selectedType.id === 'multiple' ||
    state.selectedType.id === 'stacked' ||
    state.selectedType.id === 'grouped'
      ? Stage.GroupInput
      : Stage.LabelInput;
  dom.groupNamesInput.value = '';
  dom.xLabelInput.value = '';
  dom.yLabelInput.value = '';
  dom.xModeSwitch.querySelector('input[value="range"]').checked = true;
  dom.xValuesInput.value = '';
  dom.xMinInput.value = '';
  dom.xMaxInput.value = '';
  dom.yMinInput.value = '';
  dom.yMaxInput.value = '';
  dom.groupLabelInput.value = '';
  dom.precisionSwitch.querySelector('input[value="2"]').checked = true;
  toggleGroupSection();
  updateXModeUI();
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function resetLabelsSection() {
  if (!state.selectedType || !state.images.length) {
    return;
  }
  clearMarkers();
  state.labels = { x: '', y: '' };
  if (
    state.selectedType.id === 'multiple' ||
    state.selectedType.id === 'stacked' ||
    state.selectedType.id === 'grouped'
  ) {
    state.groups = [];
    state.groupValues = [];
    state.currentGroupIndex = 0;
    state.groupLabel = 'Group';
    state.stackCursor = { xIndex: 0, groupIndex: 0 };
    dom.groupNamesInput.value = '';
    dom.groupLabelInput.value = '';
  }
  state.xValues = [];
  state.yValues = [];
  state.yRange = {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  };
  state.xInputMode = XInputMode.Range;
  state.precision = 2;
  state.stage =
    state.selectedType.id === 'multiple' ||
    state.selectedType.id === 'stacked' ||
    state.selectedType.id === 'grouped'
      ? Stage.GroupInput
      : Stage.LabelInput;
  dom.xLabelInput.value = '';
  dom.yLabelInput.value = '';
  dom.xModeSwitch.querySelector('input[value="range"]').checked = true;
  dom.xValuesInput.value = '';
  dom.xMinInput.value = '';
  dom.xMaxInput.value = '';
  dom.yMinInput.value = '';
  dom.yMaxInput.value = '';
  dom.precisionSwitch.querySelector('input[value="2"]').checked = true;
  toggleGroupSection();
  updateXModeUI();
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function resetXSection() {
  if (!state.selectedType || !state.images.length) {
    return;
  }
  clearMarkers();
  if (
    state.selectedType.id === 'multiple' ||
    state.selectedType.id === 'stacked' ||
    state.selectedType.id === 'grouped'
  ) {
    state.groupValues = [];
    state.currentGroupIndex = 0;
    state.stackCursor = { xIndex: 0, groupIndex: 0 };
  }
  state.xValues = [];
  state.yValues = [];
  state.yRange = {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  };
  state.stage = Stage.XInput;
  dom.xValuesInput.value = '';
  dom.xMinInput.value = '';
  dom.xMaxInput.value = '';
  dom.yMinInput.value = '';
  dom.yMaxInput.value = '';
  updateXModeUI();
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function resetYRangeSection() {
  if (!state.selectedType || !state.images.length) {
    return;
  }
  clearMarkers();
  if (
    state.selectedType.id === 'multiple' ||
    state.selectedType.id === 'stacked' ||
    state.selectedType.id === 'grouped'
  ) {
    state.groupValues = [];
    state.currentGroupIndex = 0;
    state.stackCursor = { xIndex: 0, groupIndex: 0 };
  }
  state.yValues = [];
  state.yRange = {
    minValue: null,
    maxValue: null,
    minPixel: null,
    maxPixel: null,
    minPercent: null,
    maxPercent: null,
  };
  state.stage = Stage.YRangeInput;
  dom.yMinInput.value = '';
  dom.yMaxInput.value = '';
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

function resetYClicksSection() {
  if (!state.selectedType || !state.images.length) {
    return;
  }
  clearMarkers();
  if (state.selectedType.id === 'multiple' || state.selectedType.id === 'stacked') {
    state.groupValues = [];
    state.currentGroupIndex = 0;
    state.stackCursor = { xIndex: 0, groupIndex: 0 };
  }
  state.yValues = [];
  state.yRange.minPixel = null;
  state.yRange.maxPixel = null;
  state.yRange.minPercent = null;
  state.yRange.maxPercent = null;
  state.stage =
    Number.isFinite(state.yRange.minValue) && Number.isFinite(state.yRange.maxValue)
      ? Stage.YRangeMinClick
      : Stage.YRangeInput;
  updateValueTable();
  setYRangeClickGuide();
  updateTaskMessage();
  updateButtonStates();
}

async function writeFile(dirHandle, fileName, contents) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function copyFile(sourceHandle, targetDirHandle, fileName) {
  const file = await sourceHandle.getFile();
  const newFileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
  const writable = await newFileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

async function removeFromSource(chartType, fileName) {
  const dirHandle = state.sourceDirByType.get(chartType.id);
  await dirHandle.removeEntry(fileName);
}

function buildCsvString() {
  if (state.selectedType?.id === 'multiple' || state.selectedType?.id === 'stacked') {
    const groupHeader = state.groupLabel || 'Group';
    const header = `${state.labels.x},${groupHeader},${state.labels.y}\n`;
    const rows = state.groups
      .map((groupName, groupIndex) => {
        const values = state.groupValues[groupIndex] || [];
        return state.xValues
          .map((x, index) => `${x},${groupName},${values[index] ?? ''}`)
          .join('\n');
      })
      .filter(Boolean)
      .join('\n');
    return `${header}${rows}\n`;
  }

  const header = `${state.labels.x},${state.labels.y}\n`;
  const rows = state.xValues
    .map((x, index) => `${x},${state.yValues[index] ?? ''}`)
    .join('\n');
  return `${header}${rows}\n`;
}

async function handleSave() {
  if (state.stage !== Stage.ReadyToSave || !state.selectedType) return;
  const chartType = state.selectedType;
  const imageRecord = state.images[state.imageIndex];
  if (!imageRecord) return;

  if (chartType.id === 'multiple' || chartType.id === 'stacked') {
    if (!state.groups.length) {
      setStatus('그룹이 설정되지 않았습니다.', '');
      return;
    }
    const missing = state.groupValues.some(
      (values) => !values || values.length !== state.xValues.length || values.includes(undefined)
    );
    if (missing || state.groupValues.length !== state.groups.length) {
      setStatus('모든 그룹의 Y 값을 먼저 입력해야 합니다.', '');
      return;
    }
  } else if (state.yValues.length !== state.xValues.length) {
    setStatus('모든 X에 대한 Y 값을 입력해야 합니다.', '');
    return;
  }

  try {
    await ensureTypeDirectories(chartType);
    const baseName = imageRecord.name.replace(/\.[^.]+$/, '');
    const csvString = buildCsvString();

    const csvDir = state.csvDirByType.get(chartType.id);
    await writeFile(csvDir, `${baseName}.csv`, csvString);

    const usedDir = state.usedDirByType.get(chartType.id);
    await copyFile(imageRecord.handle, usedDir, imageRecord.name);

    await removeFromSource(chartType, imageRecord.name);
    setStatus('CSV 저장 및 이미지 이동 완료', imageRecord.name);

    state.images.splice(state.imageIndex, 1);
    if (!state.images.length) {
      setImageDisplay(null);
      state.stage = Stage.Idle;
      updateButtonStates();
      updateTaskMessage();
      return;
    }

    if (state.imageIndex >= state.images.length) {
      state.imageIndex = state.images.length - 1;
    }
    setImageDisplay(state.images[state.imageIndex]);
    resetInputsForImage();
  } catch (err) {
    console.error(err);
    setStatus('저장 또는 이동에 실패했습니다.', err.message);
  }
}

function showImageByIndex(index) {
  if (!state.images.length) return;
  const safeIndex = Math.min(Math.max(index, 0), state.images.length - 1);
  state.imageIndex = safeIndex;
  setImageDisplay(state.images[state.imageIndex]);
  resetInputsForImage();
}

function bindEvents() {
  dom.pickRootButton.addEventListener('click', pickRootDirectory);
  dom.chartTypeButtons.forEach((button) => {
    const chartTypeId = button.dataset.chartType;
    const chartType = chartTypeMap.get(chartTypeId);
    if (chartType && !chartType.ready) {
      button.title = '준비 중';
      button.disabled = true;
    }
    button.addEventListener('click', () => handleChartTypeSelect(chartTypeId));
  });
  dom.labelsConfirmButton.addEventListener('click', handleLabelConfirm);
  dom.resetLabelsButton.addEventListener('click', resetLabelsSection);
  dom.xValuesDoneButton.addEventListener('click', handleXValuesConfirm);
  dom.resetXButton.addEventListener('click', resetXSection);
  dom.yRangeDoneButton.addEventListener('click', handleYRangeConfirm);
  dom.resetYRangeButton.addEventListener('click', resetYRangeSection);
  dom.resetYClicksButton.addEventListener('click', resetYClicksSection);
  dom.image.addEventListener('click', handleImageClick);
  dom.resetButton.addEventListener('click', resetWorkflow);
  dom.saveButton.addEventListener('click', handleSave);
  dom.prevImageButton.addEventListener('click', () => showImageByIndex(state.imageIndex - 1));
  dom.nextImageButton.addEventListener('click', () => showImageByIndex(state.imageIndex + 1));
  dom.xModeSwitch.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.name === 'xMode') {
      state.xInputMode = target.value === XInputMode.Manual ? XInputMode.Manual : XInputMode.Range;
      updateXModeUI();
    }
  });
  dom.precisionSwitch.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.name === 'precision') {
      const next = Number(target.value);
      state.precision = Number.isInteger(next) ? next : 2;
    }
  });
  dom.groupNamesDoneButton.addEventListener('click', handleGroupConfirm);
  dom.resetGroupsButton.addEventListener('click', resetGroupsSection);
}

function init() {
  bindEvents();
  resetWorkflow();
  setStatus('ChartQA 폴더를 선택하세요.', 'Line · Simple만 현재 입력 가능. 다른 타입 버튼은 자리만 마련되었습니다.');
}

init();
