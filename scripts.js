const BASE_URL = process.env.NODE_ENV === 'production' 
    ? 'goldticketbackend.up.railway.app'  // URL สำหรับ Production (เซิร์ฟเวอร์จริง)
    : 'http://localhost:3001';     // URL สำหรับ Development (localhost)


// ======================
// ตัวแปรระดับโลก (Global Variables)
// ======================
let map; // ตัวแปรเก็บออบเจ็กต์แผนที่ Leaflet
let treasureMarkers = []; // อาร์เรย์เก็บ Marker ของสมบัติทั้งหมดบนแผนที่
let currentRole = 'placer'; // บทบาทปัจจุบัน ('placer' หรือ 'hunter')
let selectedPosition = null; // ตำแหน่งที่ผู้ใช้เลือกบนแผนที่ (ใช้ในโหมด placer)
let selectedMarker = null; // Marker ของสมบัติที่เลือก (ใช้ในโหมด hunter)
let selectedTreasure = null; // ข้อมูลสมบัติที่เลือก
let treasures = []; // อาร์เรย์เก็บข้อมูลสมบัติทั้งหมด
let userLocation = null; // ตำแหน่งปัจจุบันของผู้ใช้

// ======================
// ฟังก์ชันหลักสำหรับการเริ่มต้นแผนที่ (Main Map Initialization)
// ======================
function initMap() {
    initializeMap(); // ตั้งค่าแผนที่พื้นฐาน
    loadTreasuresFromStorage(); // โหลดข้อมูลสมบัติจาก localStorage
    setupGeolocation(); // ตั้งค่าการระบุตำแหน่ง
    setupMapClickHandler(); // ตั้งค่าการจัดการคลิกบนแผนที่
}

// ======================
// ฟังก์ชันย่อยสำหรับการทำงานต่างๆ (Helper Functions)
// ======================

/**
 * 1. ฟังก์ชันเริ่มต้นแผนที่พื้นฐาน
 * สร้างแผนที่ Leaflet และตั้งค่าพื้นฐาน
 */
function initializeMap() {
    // ตั้งค่าตำแหน่งกลางแผนที่ (พิกัดประเทศไทย)
    const defaultCenter = [15.8700, 100.9925];
    
    // สร้างแผนที่และตั้งค่ามุมมองเริ่มต้น
    map = L.map('map').setView(defaultCenter, 6);
    
    // เพิ่มแผ่นแผนที่จาก OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
}

/**
 * 2. ฟังก์ชันโหลดข้อมูลจาก localStorage
 * โหลดข้อมูลสมบัติจากที่เก็บในเบราว์เซอร์
 */
function loadTreasuresFromStorage() {
    try {
        const storedTreasures = localStorage.getItem('treasures');
        if (storedTreasures) {
            treasures = JSON.parse(storedTreasures);
            
            // กรองข้อมูลสมบัติที่ไม่มีตำแหน่งหรือถูกเคลมแล้ว
            treasures = treasures.filter(t => 
                t && 
                typeof t.lat === 'number' && 
                typeof t.lng === 'number' &&
                !isNaN(t.lat) && 
                !isNaN(t.lng) &&
                (t.claimed === undefined || t.claimed === false)
            );
        }
    } catch (e) {
        console.error("เกิดข้อผิดพลาดในการโหลดสมบัติ:", e);
        treasures = [];
    }
}

/**
 * 3. ฟังก์ชันตั้งค่าการระบุตำแหน่ง
 * ใช้ Geolocation API เพื่อขอตำแหน่งปัจจุบันของผู้ใช้
 */
function setupGeolocation() {
    if (!navigator.geolocation) {
        alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง กำลังใช้ตำแหน่งเริ่มต้น");
        document.getElementById('loading-message').style.display = 'none';
        loadTreasures();
        return;
    }

    // ขอตำแหน่งปัจจุบัน (ใช้ความแม่นยำสูง, timeout 10 วินาที)
    navigator.geolocation.getCurrentPosition(
        handleGeolocationSuccess,
        handleGeolocationError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

/**
 * 3.1 ฟังก์ชันจัดการเมื่อระบุตำแหน่งสำเร็จ
 * @param {Position} position - ตำแหน่งที่ได้จาก Geolocation API
 */
function handleGeolocationSuccess(position) {
    userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };
    
    updateUserLocationOnMap(userLocation);
    hideLoadingMessage();
    loadTreasures();
}

/**
 * 3.2 ฟังก์ชันจัดการเมื่อระบุตำแหน่งผิดพลาด
 * @param {GeolocationPositionError} error - ข้อผิดพลาดจากการระบุตำแหน่ง
 */
function handleGeolocationError(error) {
    console.warn("ข้อผิดพลาดการระบุตำแหน่ง:", error);
    alert("ไม่สามารถระบุตำแหน่งของคุณได้ กำลังใช้ตำแหน่งเริ่มต้น");
    hideLoadingMessage();
    loadTreasures();
}

/**
 * 4. ฟังก์ชันอัปเดตตำแหน่งผู้ใช้บนแผนที่
 * @param {Object} location - ตำแหน่งปัจจุบัน {lat, lng}
 */
function updateUserLocationOnMap(location) {
    // ลบ Marker เก่าถ้ามี
    if (window.userMarker) {
        map.removeLayer(window.userMarker);
    }
    
    // สร้าง Marker ใหม่สำหรับตำแหน่งปัจจุบัน
    window.userMarker = L.marker([location.lat, location.lng], {
        icon: L.divIcon({
            className: 'current-location-icon',
            html: '📍', // ใช้อิโมจิเป็นไอคอน
            iconSize: [50, 50]
        })
    }).addTo(map)
    .bindPopup("ตำแหน่งปัจจุบันของคุณ")
    .openPopup();
    
    // ย้ายมุมมองแผนที่ไปที่ตำแหน่งปัจจุบัน (ซูมระดับ 20)
    map.setView([location.lat, location.lng], 20);
}

/**
 * 5. ฟังก์ชันตั้งค่าการคลิกบนแผนที่
 * ตั้งค่าการจัดการเหตุการณ์เมื่อผู้ใช้คลิกบนแผนที่
 */
function setupMapClickHandler() {
    map.on('click', (event) => {
        if (currentRole === 'placer') {
            handleMapClickForPlacer(event);
        }
    });
}

/**
 * 5.1 ฟังก์ชันจัดการการคลิกสำหรับผู้วางสมบัติ
 * @param {LeafletEvent} event - เหตุการณ์คลิกบนแผนที่
 */
function handleMapClickForPlacer(event) {
    selectedPosition = event.latlng; // บันทึกตำแหน่งที่เลือก
    setCurrentDate(); // ตั้งค่าวันที่ปัจจุบันในฟอร์ม
    showPlaceTreasureModal(); // แสดงโมดอลสำหรับวางสมบัติ
}

/**
 * 6. ฟังก์ชันโหลดและแสดงสมบัติบนแผนที่
 * ดึงข้อมูลสมบัติจากเซิร์ฟเวอร์และแสดงบนแผนที่
 */
async function loadTreasures() {
    try {
        clearTreasureMarkers(); // ลบ Marker เก่าทั้งหมด
        
        // ดึงข้อมูลสมบัติจาก API
        const response = await fetch(`http://${BASE_URL}/api/treasures`);
        treasures = await response.json();
        
        // จัดกลุ่มสมบัติที่ตำแหน่งเดียวกัน
        const locationGroups = groupTreasuresByLocation(treasures);
        
        // สร้าง Marker บนแผนที่
        createTreasureMarkers(locationGroups);
    } catch (error) {
        console.error("Error loading treasures:", error);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูลสมบัติ");
    }
}

/**
 * 6.1 ล้างเครื่องหมายสมบัติเก่า
 * ลบ Marker สมบัติทั้งหมดออกจากแผนที่
 */
function clearTreasureMarkers() {
    treasureMarkers.forEach(marker => map.removeLayer(marker));
    treasureMarkers = [];
}

/**
 * 6.2 จัดกลุ่มสมบัติตามตำแหน่ง
 * @param {Array} treasures - อาร์เรย์ของสมบัติทั้งหมด
 * @returns {Object} กลุ่มสมบัติที่ตำแหน่งเดียวกัน
 */
function groupTreasuresByLocation(treasures) {
    const locationGroups = {};
    
    treasures.forEach(treasure => {
        const locationKey = `${treasure.lat},${treasure.lng}`;
        if (!locationGroups[locationKey]) {
            locationGroups[locationKey] = [];
        }
        locationGroups[locationKey].push(treasure);
    });
    
    return locationGroups;
}

/**
 * 6.3 สร้างเครื่องหมายสมบัติบนแผนที่
 * @param {Object} locationGroups - กลุ่มสมบัติที่ตำแหน่งเดียวกัน
 */
function createTreasureMarkers(locationGroups) {
    Object.values(locationGroups).forEach(treasureGroup => {
        if (treasureGroup.length === 0) return;
        
        const position = treasureGroup[0];
        
        // สร้าง Marker ด้วยไอคอนแบบ stacked
        const marker = L.marker([position.lat, position.lng], {
            icon: createStackedIcon(treasureGroup.length)
        }).addTo(map);
        
        // เก็บข้อมูลสมบัติทั้งหมดที่ตำแหน่งนี้
        marker.treasuresAtLocation = treasureGroup;
        
        // ตั้งค่าการคลิกที่ Marker (สำหรับโหมด hunter)
        marker.on('click', () => {
            if (currentRole === 'hunter') {
                handleTreasureMarkerClick(marker, treasureGroup);
            }
        });
        
        treasureMarkers.push(marker);
    });
}

/**
 * 6.4 จัดการเมื่อคลิกที่เครื่องหมายสมบัติ
 * @param {LeafletMarker} marker - Marker ที่ถูกคลิก
 * @param {Array} treasureGroup - กลุ่มสมบัติที่ตำแหน่งนี้
 */
function handleTreasureMarkerClick(marker, treasureGroup) {
    selectedMarker = marker;
    
    // หาสมบัติที่ยังไม่ถูกเคลม หรือใช้ตัวแรกเป็นค่าเริ่มต้น
    selectedTreasure = treasureGroup.find(t => !t.claimed) || treasureGroup[0];
    
    displayTreasureInfo(selectedTreasure);
    document.getElementById('view-treasure-modal').style.display = 'flex';
}

/**
 * 7. ฟังก์ชันแสดงข้อมูลสมบัติ
 * @param {Object} treasure - ข้อมูลสมบัติที่จะแสดง
 */
function displayTreasureInfo(treasure) {
    if (!treasure) return;
    
    let infoHTML = `
        <p><strong>วันที่วาง:</strong> ${treasure.placementDate || 'ไม่ระบุ'}</p>
        <p><strong>ชื่อร้าน:</strong> ${treasure.name || 'ไม่ระบุ'}</p>
    `;
    
    // เพิ่มข้อมูลเพิ่มเติมถ้ามี
    if (treasure.ig) infoHTML += `<p><strong>ไอจีร้าน:</strong> ${treasure.ig}</p>`;
    if (treasure.face) infoHTML += `<p><strong>เฟสร้าน:</strong> ${treasure.face}</p>`;
    
    infoHTML += `
        <p><strong>ภารกิจ:</strong> ${treasure.mission || 'ไม่ระบุ'}</p>
        <p><strong>ส่วนลด:</strong> ${treasure.discount || 'ไม่ระบุ'}%</p>
    `;
    
    // แสดงจำนวนกล่องสมบัติที่เหลือถ้ามีมากกว่า 1
    if (selectedMarker?.treasuresAtLocation) {
        const boxesAtLocation = selectedMarker.treasuresAtLocation.filter(t => !t.claimed).length;
        if (boxesAtLocation > 1) {
            infoHTML += `<p><strong>จำนวนกล่องสมบัติที่เหลืออยู่:</strong> ${boxesAtLocation}</p>`;
        }
    }
    
    document.getElementById('treasure-info').innerHTML = infoHTML;
}

/**
 * 8. สร้างไอคอนกล่องสมบัติ
 * @param {Number} count - จำนวนสมบัติที่ตำแหน่งนี้
 * @returns {L.DivIcon} ไอคอนสำหรับ Marker
 */
function createStackedIcon(count) {
    return L.divIcon({
        className: 'treasure-icon',
        html: `💰`, // ใช้อิโมจิเงินเป็นไอคอน
        iconSize: [20, 20]
    });
}

/**
 * 10. ฟังก์ชันย่อยช่วยเหลือ
 */
function hideLoadingMessage() {
    document.getElementById('loading-message').style.display = 'none';
}

function setCurrentDate() {
    document.getElementById('placement-date').valueAsDate = new Date();
}

function showPlaceTreasureModal() {
    document.getElementById('place-treasure-modal').style.display = 'flex';
}

// ======================
// การทำงานเมื่อหน้าเว็บโหลดเสร็จ (DOM Content Loaded)
// ======================
document.addEventListener('DOMContentLoaded', function() {
    initMap(); // เริ่มต้นแผนที่
    setupEventListeners(); // ตั้งค่าการจัดการเหตุการณ์
});

/**
 * ตั้งค่าการจัดการเหตุการณ์ต่างๆ
 */
function setupEventListeners() {
    // องค์ประกอบ DOM
    const placerBtn = document.getElementById('placer-btn');
    const hunterBtn = document.getElementById('hunter-btn');
    const placerInstructions = document.getElementById('placer-instructions');
    const hunterInstructions = document.getElementById('hunter-instructions');
    
    // การเปลี่ยนบทบาท
    placerBtn.addEventListener('click', () => switchRole('placer'));
    hunterBtn.addEventListener('click', () => switchRole('hunter'));
    
    // ตั้งค่าอีเวนต์สำหรับโมดอลต่างๆ
    setupModalEventListeners();
    setupFormEventListeners();
}

/**
 * สลับบทบาทระหว่างผู้วางและผู้ตามหาสมบัติ
 * @param {String} role - บทบาทใหม่ ('placer' หรือ 'hunter')
 */
function switchRole(role) {
    currentRole = role;
    
    // อัปเดต UI ตามบทบาท
    document.getElementById('placer-btn').classList.toggle('active', role === 'placer');
    document.getElementById('hunter-btn').classList.toggle('active', role === 'hunter');
    document.getElementById('placer-instructions').style.display = role === 'placer' ? 'block' : 'none';
    document.getElementById('hunter-instructions').style.display = role === 'hunter' ? 'block' : 'none';
}

/**
 * ตั้งค่าการจัดการเหตุการณ์สำหรับโมดอลทั้งหมด
 */
function setupModalEventListeners() {
    // ปุ่มปิดโมดอล
    document.getElementById('close-place-modal').addEventListener('click', () => hideModal('place-treasure-modal'));
    document.getElementById('close-view-modal').addEventListener('click', () => hideModal('view-treasure-modal'));
    document.getElementById('close-proof-modal').addEventListener('click', () => hideModal('submit-proof-modal'));
    document.getElementById('close-code-modal').addEventListener('click', () => hideModal('discount-code-modal'));
    
    // ปุ่มยกเลิก
    document.getElementById('cancel-place').addEventListener('click', () => hideModal('place-treasure-modal'));
    document.getElementById('cancel-view').addEventListener('click', () => hideModal('view-treasure-modal'));
    document.getElementById('cancel-proof').addEventListener('click', () => {
        hideModal('submit-proof-modal');
        showModal('view-treasure-modal');
    });
    document.getElementById('close-code').addEventListener('click', () => hideModal('discount-code-modal'));
    
    // ปุ่มดำเนินการ
    document.getElementById('save-treasure').addEventListener('click', saveTreasure);
    document.getElementById('next-step').addEventListener('click', () => {
        hideModal('view-treasure-modal');
        showModal('submit-proof-modal');
    });
    document.getElementById('submit-proof').addEventListener('click', submitProof);
}

/**
 * ตั้งค่าการจัดการเหตุการณ์สำหรับฟอร์ม
 */
function setupFormEventListeners() {
    // แสดงตัวอย่างรูปภาพหลักฐานเมื่อเลือกไฟล์
    document.getElementById('proof-image').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                document.getElementById('proof-preview').src = event.target.result;
                document.getElementById('proof-preview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

/**
 * ซ่อนโมดอล
 * @param {String} modalId - ID ของโมดอลที่จะซ่อน
 */
function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

/**
 * แสดงโมดอล
 * @param {String} modalId - ID ของโมดอลที่จะแสดง
 */
function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

/**
 * บันทึกสมบัติใหม่
 */
async function saveTreasure() {
    if (!selectedPosition) {
        alert('กรุณาเลือกตำแหน่งบนแผนที่ก่อน');
        return;
    }
    
    const formData = getTreasureFormData();
    
    if (!validateTreasureForm(formData)) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }
    
    try {
        await saveTreasuresToServer(formData);
        await loadTreasures();
        resetTreasureForm();
        hideModal('place-treasure-modal');
    } catch (error) {
        console.error("Error saving treasure:", error);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
}

/**
 * ดึงข้อมูลจากฟอร์มวางสมบัติ
 * @returns {Object} ข้อมูลจากฟอร์ม
 */
function getTreasureFormData() {
    return {
        lat: selectedPosition.lat,
        lng: selectedPosition.lng,
        boxCount: parseInt(document.getElementById('total-boxes').value) || 1,
        name: document.getElementById('name').value.trim(),
        ig: document.getElementById('ig').value.trim(),
        face: document.getElementById('face').value.trim(),
        mission: document.getElementById('mission').value.trim(),
        discount: document.getElementById('discount').value.trim(),
        placementDate: document.getElementById('placement-date').value
    };
}

/**
 * ตรวจสอบความถูกต้องของฟอร์ม
 * @param {Object} formData - ข้อมูลจากฟอร์ม
 * @returns {Boolean} ถูกต้องหรือไม่
 */
function validateTreasureForm(formData) {
    return formData.name && formData.mission && formData.discount && formData.placementDate;
}

/**
 * บันทึกสมบัติลงเซิร์ฟเวอร์
 * @param {Object} formData - ข้อมูลสมบัติที่จะบันทึก
 */
async function saveTreasuresToServer(formData) {
    for (let i = 0; i < formData.boxCount; i++) {
        const response = await fetch(`http://${BASE_URL}/api/treasures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: formData.lat,
                lng: formData.lng,
                placementDate: formData.placementDate,
                name: formData.name,
                ig: formData.ig,
                face: formData.face,
                mission: formData.mission,
                discount: formData.discount,
                claimed: false
            })
        });
        
        if (!response.ok) throw new Error('Failed to save treasure');
    }
}

/**
 * รีเซ็ตฟอร์มวางสมบัติ
 */
function resetTreasureForm() {
    document.getElementById('name').value = '';
    document.getElementById('ig').value = '';
    document.getElementById('face').value = '';
    document.getElementById('mission').value = '';
    document.getElementById('discount').value = '';
    document.getElementById('total-boxes').value = '1';
}

/**
 * ส่งหลักฐานการพบสมบัติ
 */
async function submitProof() {
    if (!selectedTreasure) {
        alert('เกิดข้อผิดพลาด: ไม่พบสมบัติที่เลือก');
        return;
    }
    
    if (!document.getElementById('proof-image').files?.[0]) {
        alert('กรุณาอัปโหลดรูปภาพหลักฐาน');
        return;
    }
    
    try {
        await updateTreasureStatus();
        await loadTreasures();
        displayDiscountCode();
        resetProofForm();
    } catch (error) {
        console.error("Error submitting proof:", error);
        alert("เกิดข้อผิดพลาดในการส่งหลักฐาน");
    }
}

/**
 * อัปเดตสถานะสมบัติเป็นถูกเคลมแล้ว
 */
async function updateTreasureStatus() {
    const response = await fetch(`http://${BASE_URL}/api/treasures/${selectedTreasure._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimed: true })
    });
    
    if (!response.ok) throw new Error('Failed to update treasure status');
}

/**
 * 9. สร้างรหัสส่วนลดแบบสุ่ม
 * @returns {String} รหัสส่วนลด 8 ตัวอักษร
 */
function generateDiscountCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัวอักษรและตัวเลขที่ใช้
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * เเสดงข้อมูลที่ต้องเเคปเเชทให้ทางร้าน
 */
function displayDiscountCode() {
    const discountCode = generateDiscountCode(); // 🔐 สร้างรหัสสุ่ม

    // แสดงข้อมูลร้าน
    document.getElementById('shop-name-display').textContent = selectedTreasure.name || 'ไม่ระบุ';
    document.getElementById('mission-display').textContent = selectedTreasure.mission || 'ไม่ระบุ';
    document.getElementById('discount-display').textContent = (selectedTreasure.discount || '0') + '%';

    // 🆕 แสดงรหัสส่วนลด
    const discountCodeElement = document.getElementById('discount-code-display');
    if (discountCodeElement) {
        discountCodeElement.textContent = discountCode;
    } else {
        console.warn('ไม่พบ element สำหรับแสดงรหัสส่วนลด');
    }

    // แสดงรูปภาพหลักฐาน
    const file = document.getElementById('proof-image').files[0];
    const reader = new FileReader();
    reader.onload = function(event) {
        document.getElementById('proof-image-display').src = event.target.result;
        document.getElementById('proof-image-display').style.display = 'block';
    };
    reader.readAsDataURL(file);

    hideModal('submit-proof-modal');
    showModal('discount-code-modal');

    // ⏬ รอให้ modal เปิดแล้วค่อย capture
    setTimeout(() => {
        const targetElement = document.getElementById('discount-code-modal'); // หรือ container ที่ต้องการแคป

        html2canvas(targetElement).then(canvas => {
            // แปลง canvas เป็นรูป
            const image = canvas.toDataURL("image/png");

            // สร้างลิงก์ดาวน์โหลดอัตโนมัติ
            const downloadLink = document.createElement('a');
            downloadLink.href = image;
            downloadLink.download = 'รหัสคูปอง.png';
            downloadLink.click();
        }).catch(err => {
            console.error("เกิดข้อผิดพลาดในการแคปหน้าจอ:", err);
        });
    }, 1000); // รอ modal แสดงผล 1 วิ ก่อน capture
    
}

/**
 * รีเซ็ตฟอร์มส่งหลักฐาน
 */
function resetProofForm() {
    document.getElementById('proof-image').value = '';
    document.getElementById('proof-preview').style.display = 'none';
    document.getElementById('proof-preview').src = '';
}
