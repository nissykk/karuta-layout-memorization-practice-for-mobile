// --- グローバル変数 ---
let allKarutaData = []; // 100枚すべての札データ (fetchで読み込む)
let teiichiData = {};   // ユーザーの定位置データ
let currentGameTimer = null; // 実行中のタイマー
let currentKaraFudaIds = []; // 現在の空札IDリスト
const TOTAL_ROWS = 3; // 3段
let selectedFuda = null; // ★ タップ選択中の札
let originalParent = null; // ★ 選択した札の元の親要素

// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');
const jiJinField = document.getElementById('jiJin');
const tekiJinField = document.getElementById('tekiJin');
const karaFudaList = document.getElementById('karaFudaList');
const manualArea = document.getElementById('manualArea');
const temaeFudaArea = document.getElementById('temaeFuda');
const cardCountInput = document.getElementById('cardCount');
const jiJinModeSelect = document.getElementById('jiJinMode');

const timerSelect = document.getElementById('timerSelect');
const timerDisplay = document.getElementById('timerDisplay');
const toggleKaraFuda = document.getElementById('toggleKaraFuda');
const instructionText = document.getElementById('instructionText');

// --- イベントリスナー ---
startButton.addEventListener('click', startGame);
toggleKaraFuda.addEventListener('click', toggleKaraFudaVisibility);

// --- 初期化処理 ---
async function initialize() {
    // 1. 札データの読み込み (JSON分離版)
    try {
        const response = await fetch('karuta_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allKarutaData = await response.json();
    } catch (e) {
        console.error("札データの読み込みに失敗:", e);
        alert("karuta_data.json の読み込みに失敗しました。\nファイルが存在するか、サーバーが正しく動作しているか確認してください。");
        return;
    }

    // 2. 定位置データの読み込み
    const savedTeiichi = localStorage.getItem('karutaTeiichi');
    if (savedTeiichi) {
        try {
            teiichiData = JSON.parse(savedTeiichi);
            console.log("定位置データを読み込みました:", teiichiData);
        } catch (e) {
            console.error("定位置データの解析に失敗:", e);
            localStorage.removeItem('karutaTeiichi');
        }
    } else {
        console.log("カスタム定位置データはありません。");
    }

    // 3. ★ タップ（クリック）リスナーの設定
    setupClickListeners();
    updateInstructionText();
}

// --- メインの関数 ---

// 「段」と「左右グループ」を生成する関数
function createRows(fieldElement, prefix) {
    fieldElement.innerHTML = '';
    for (let i = 0; i < TOTAL_ROWS; i++) {
        const row = document.createElement('div');
        row.className = 'row-slot';
        row.dataset.rowId = `${prefix}-${i}`;

        const leftGroup = document.createElement('div');
        leftGroup.className = 'left-group';
        leftGroup.dataset.groupId = `${prefix}-${i}-left`;

        const rightGroup = document.createElement('div');
        rightGroup.className = 'right-group';
        rightGroup.dataset.groupId = `${prefix}-${i}-right`;

        row.appendChild(leftGroup);
        row.appendChild(rightGroup);
        fieldElement.appendChild(row);
    }
}

// 1. ゲーム開始
function startGame() {
    // 0. タイマーリセット
    if (currentGameTimer) {
        clearInterval(currentGameTimer);
         currentGameTimer = null;
    }
    const selectedMinutes = parseInt(timerSelect.value);
    timerDisplay.textContent = `${selectedMinutes < 10 ? '0' : ''}${selectedMinutes}:00`;
    timerSelect.disabled = false;

    // 選択中の札があればリセット
    if (selectedFuda) {
        cancelSelection();
    }
    document.body.removeEventListener('click', handleFlipClick);
    setupClickListeners();

    // 1. フィールドをリセット
    temaeFudaArea.innerHTML = '';
    manualArea.classList.add('hidden');
    jiJinField.classList.remove('manual-setup');

    createRows(jiJinField, 'j');
    createRows(tekiJinField, 't');

    // 2. 設定を取得
    const totalCount = parseInt(cardCountInput.value);
    const jiJinMode = jiJinModeSelect.value;
    const playerCardCount = totalCount / 2;

    const maxCardsPerSide = 25;
    if (totalCount > (maxCardsPerSide * 2) || totalCount < 2 || totalCount % 2 !== 0) {
        alert(`札数は2～${maxCardsPerSide * 2} (50枚) の偶数を指定してください。`);
        return;
    }

    // 3. 札をシャッフルして選定
    const shuffledIds = allKarutaData.map(fuda => fuda.id).sort(() => 0.5 - Math.random());
    const baFudaIds = shuffledIds.slice(0, totalCount);
    const karaFudaIds = shuffledIds.slice(totalCount);
    currentKaraFudaIds = karaFudaIds;
    const jiJinFudaIds = baFudaIds.slice(0, playerCardCount);
    const tekiJinFudaIds = baFudaIds.slice(playerCardCount);

    // 4. 空札リストを初期化
    karaFudaList.innerHTML = '';
    karaFudaList.classList.add('hidden');
    const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement;
    if (karaFudaHeader && karaFudaHeader.firstChild.nodeType === Node.TEXT_NODE) {
       karaFudaHeader.firstChild.textContent = `空札 (${currentKaraFudaIds.length}枚) `;
    }

    // 5. 相手陣を配置
    placeFudaInRows(tekiJinField, tekiJinFudaIds);

    // 6. 自陣の配置
    if (jiJinMode === 'auto') {
        placeFudaInRows(jiJinField, jiJinFudaIds);
        startTimer(selectedMinutes * 60);
    } else {
        setupJiJinManual(jiJinFudaIds);
    }
    updateInstructionText();
}

// 2. 札を「段」の左右グループに配置する (AI / 自動配置)
function placeFudaInRows(fieldElement, fudaIds) {
    const rows = Array.from(fieldElement.querySelectorAll('.row-slot'));
    const groups = {
        topLeft: rows[0].querySelector('.left-group'), topRight: rows[0].querySelector('.right-group'),
        midLeft: rows[1].querySelector('.left-group'), midRight: rows[1].querySelector('.right-group'),
        bottomLeft: rows[2].querySelector('.left-group'), bottomRight: rows[2].querySelector('.right-group')
    };
    const oneCharIds = [87, 18, 57, 22, 70, 81, 77];
    const oyamaFudaIds = [31, 64, 15, 50, 76, 11];
    let fudaToPlace = fudaIds.map(id => allKarutaData.find(f => f.id === id)).sort(() => 0.5 - Math.random());
    const rightCount = Math.ceil(fudaToPlace.length / 2);
    let leftFudaCount = 0;
    let rightFudaCount = 0;
    const oneCharFuda = fudaToPlace.filter(f => oneCharIds.includes(f.id));
    const oyamaFuda = fudaToPlace.filter(f => oyamaFudaIds.includes(f.id));
    const otherFuda = fudaToPlace.filter(f => !oneCharIds.includes(f.id) && !oyamaFudaIds.includes(f.id));
    // 2a. 一字決まり
    oneCharFuda.forEach((fuda, index) => {
        const fudaElement = createFudaElement(fuda);
        if (index % 2 === 0 && rightFudaCount < rightCount) {
            groups.bottomRight.appendChild(fudaElement); rightFudaCount++;
        } else {
            groups.bottomLeft.appendChild(fudaElement); leftFudaCount++;
        }
    });
    // 2b. 大山札
    oyamaFuda.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        if (rightFudaCount < rightCount) {
            if (groups.bottomRight.children.length < 5) groups.bottomRight.appendChild(fudaElement);
            else groups.midRight.appendChild(fudaElement);
            rightFudaCount++;
        } else {
             groups.midLeft.appendChild(fudaElement); leftFudaCount++;
        }
    });
    // 2c. 残り
    otherFuda.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        if (rightFudaCount < rightCount) {
            if (groups.topRight.children.length < 5) groups.topRight.appendChild(fudaElement);
            else if (groups.midRight.children.length < 5) groups.midRight.appendChild(fudaElement);
            else groups.bottomRight.appendChild(fudaElement);
            rightFudaCount++;
        } else {
            if (groups.topLeft.children.length < 5) groups.topLeft.appendChild(fudaElement);
            else if (groups.midLeft.children.length < 5) groups.midLeft.appendChild(fudaElement);
            else groups.bottomLeft.appendChild(fudaElement);
            leftFudaCount++;
        }
    });
}

// 3b. 自陣の手動配置（準備）
function setupJiJinManual(fudaIds) {
    manualArea.classList.remove('hidden');
    temaeFudaArea.innerHTML = '';
    fudaIds.forEach(id => {
        const fuda = allKarutaData.find(f => f.id === id);
        const fudaElement = createFudaElement(fuda);
        temaeFudaArea.appendChild(fudaElement);
    });
    jiJinField.classList.add('manual-setup');
    updateInstructionText();
}

// 4. ★ タップ（クリック）イベントリスナー設定
function setupClickListeners() {
    document.body.removeEventListener('click', handleFieldClick);
    document.body.removeEventListener('click', handleFlipClick);
    document.body.addEventListener('click', handleFieldClick);
}

// 4a. ★ タップ（クリック）イベントハンドラ (タップ方式修正版)
function handleFieldClick(e) {
    const clickedElement = e.target;
    const clickedFuda = clickedElement.closest('.fuda'); // クリックされた札自体

    // --- 札を選択中の場合 (2回目のタップ) ---
    if (selectedFuda) {
        // 同じ札を再度タップした場合は選択キャンセル
        if (clickedFuda === selectedFuda) {
            cancelSelection();
            return;
        }

        let dropTargetContainer = clickedElement.closest('.left-group, .right-group, #temaeFuda');
        // グループ間の隙間タップ時の処理
        if (!dropTargetContainer && clickedElement.closest('.row-slot')) {
            const rowSlot = clickedElement.closest('.row-slot');
            const rowRect = rowSlot.getBoundingClientRect();
            const clickXRatio = (e.clientX - rowRect.left) / rowRect.width;
            dropTargetContainer = clickXRatio < 0.5 ? rowSlot.querySelector('.left-group') : rowSlot.querySelector('.right-group');
        }

        // 有効なドロップ先コンテナか？
        const isInManualSetup = jiJinField.classList.contains('manual-setup');
        const isTimerRunning = currentGameTimer !== null;
        const isAllowedJiJinGroup = dropTargetContainer && (dropTargetContainer.classList.contains('left-group') || dropTargetContainer.classList.contains('right-group')) && jiJinField.contains(dropTargetContainer) && (isInManualSetup || isTimerRunning);
        const isAllowedTemaeFuda = dropTargetContainer && dropTargetContainer.id === 'temaeFuda' && isInManualSetup;

        if (isAllowedJiJinGroup || isAllowedTemaeFuda) {
            const afterElement = getInsertBeforeElement(dropTargetContainer, e.clientX);
            selectedFuda.classList.remove('selected'); // 透明度を戻す

            if (afterElement == null) {
                dropTargetContainer.appendChild(selectedFuda);
            } else {
                dropTargetContainer.insertBefore(selectedFuda, afterElement);
            }
            selectedFuda = null; // 選択解除
            originalParent = null;
            checkManualPlacementComplete();
        } else {
            // 無効な場所をタップした場合は選択キャンセル
            cancelSelection();
        }
        updateInstructionText();
    }
    // --- 札を選択中でない場合 (1回目のタップ) ---
    else {
        // クリックされたのが札で、かつ相手陣の札ではないか？
        const isInManualSetup = jiJinField.classList.contains('manual-setup');
        const isTimerRunning = currentGameTimer !== null;

        if (clickedFuda && !clickedFuda.closest('#tekiJin') && (isInManualSetup || isTimerRunning)) {
            // 暗記練習モード中は選択不可
            if (clickedFuda.classList.contains('back')) {
                 return;
            }
            selectedFuda = clickedFuda;
            originalParent = selectedFuda.parentElement;
            selectedFuda.classList.add('selected'); // 半透明にする
            updateInstructionText();
        }
    }
}

// 4b. ★ カーソル追従関数 -> 不要になったので削除

// 4c. ★ 選択キャンセル関数 (タップ方式修正版)
function cancelSelection() {
    if (selectedFuda) {
        selectedFuda.classList.remove('selected'); // 透明度を戻す
        // 元の場所に戻す処理は不要（DOMから移動させていないため）
        selectedFuda = null;
        originalParent = null;
        // console.log("Selection Cancelled");
    }
     updateInstructionText();
}

// 4d. ★ マウスX座標に基づいて、挿入すべき位置（の次の要素）を見つける関数 (修正版)
function getInsertBeforeElement(container, x) {
    const children = [...container.querySelectorAll('.fuda:not(.selected)')];
    const elementToInsertBefore = children.find(child => {
        const box = child.getBoundingClientRect();
        return x < box.left + box.width / 2;
    });
    return elementToInsertBefore;
}

// 4e. 手動配置完了チェック
function checkManualPlacementComplete() {
    if (manualArea.classList.contains('hidden')) return;
    const fudaInTemate = temaeFudaArea.querySelectorAll('.fuda').length;
    if (fudaInTemate === 0) {
        manualArea.classList.add('hidden');
        jiJinField.classList.remove('manual-setup');
        const selectedMinutes = parseInt(timerSelect.value);
        startTimer(selectedMinutes * 60);
    }
}

// 5. タイマー開始
function startTimer(duration) {
    if (currentGameTimer) clearInterval(currentGameTimer);
    timerSelect.disabled = true;
    updateInstructionText("暗記中 (自陣の札をタップして選択、再度タップで配置)");
    let timer = duration;
    currentGameTimer = setInterval(() => {
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        timerDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        if (--timer < 0) {
            clearInterval(currentGameTimer);
            currentGameTimer = null;
            timerDisplay.textContent = "暗記終了！";
            timerSelect.disabled = false;
            enterPracticeMode();
        }
    }, 1000);
}

// 6. 暗記練習モード
function enterPracticeMode() {
    if (selectedFuda) cancelSelection();
    const allBaFuda = document.querySelectorAll('#jiJin .fuda, #tekiJin .fuda');
    allBaFuda.forEach(fuda => {
        fuda.classList.add('back');
        fuda.style.cursor = 'pointer';
    });
     document.body.removeEventListener('click', handleFieldClick);
     document.body.addEventListener('click', handleFlipClick);
     updateInstructionText("暗記練習中 (裏向きの札をタップで確認)");
}

// 6b. ★ 裏返すためのクリックハンドラ
function handleFlipClick(e) {
     if (currentGameTimer === null) {
         const clickedFuda = e.target.closest('.fuda.back');
         if (clickedFuda) {
             clickedFuda.classList.toggle('back');
         }
     }
}

// ★ 操作説明更新関数 (タップ方式版)
function updateInstructionText(customText = null) {
    const textElement = document.getElementById('instructionText');
    if (!textElement) return;

    if (customText) {
        textElement.textContent = customText;
        return;
    }

    const isInManualSetup = jiJinField.classList.contains('manual-setup');
    const isTimerRunning = currentGameTimer !== null;

    if (selectedFuda) {
        textElement.textContent = "配置したい場所をタップしてください (同じ札か無効な場所タップでキャンセル)";
    } else if (isInManualSetup) {
        textElement.textContent = "手札の札をタップして選択し、自陣または手札に戻したい場所をタップして配置";
    } else if (isTimerRunning) {
        textElement.textContent = "自陣の札をタップして選択し、移動させたい場所をタップして配置";
    } else if (currentGameTimer === null && !isInManualSetup && document.querySelector('.fuda.back')) {
        // 暗記練習モードの判定を追加
         textElement.textContent = "暗記練習中 (裏向きの札をタップで確認)";
    }
     else {
        textElement.textContent = "「開始」ボタンを押してください";
    }
}

// --- 空札表示用の関数 ---
function toggleKaraFudaVisibility() {
    const isNowHidden = karaFudaList.classList.toggle('hidden');
    if (!isNowHidden && karaFudaList.innerHTML === '') {
        if (currentKaraFudaIds.length > 0) displayKaraFuda(currentKaraFudaIds);
        else karaFudaList.innerHTML = '<p>まだ試合が開始されていません。</p>';
    }
}
function displayKaraFuda(fudaIds) {
    karaFudaList.innerHTML = '';
    const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement;
    if (karaFudaHeader && karaFudaHeader.firstChild.nodeType === Node.TEXT_NODE) {
       karaFudaHeader.firstChild.textContent = `空札 (${fudaIds.length}枚) `;
    }
    const karaFudaData = fudaIds
        .map(id => allKarutaData.find(fuda => fuda.id === id))
        .filter(fuda => fuda)
        .sort((a, b) => a.id - b.id);
    karaFudaData.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        fudaElement.style.transform = 'none';
        fudaElement.style.cursor = 'default';
        karaFudaList.appendChild(fudaElement);
    });
}

// --- ユーティリティ関数 ---
function createFudaElement(fuda) {
    const div = document.createElement('div');
    div.className = 'fuda';
    div.style.backgroundImage = `url('${fuda.image_path}')`;
    div.dataset.id = fuda.id;
    div.title = `[${fuda.id}] ${fuda.kami}\n${fuda.shimo}`;
    return div;
}

// --- 起動 ---
initialize();