import field1Json from '../public/field1.json'
import field2Json from '../public/field2.json'
import tileMap from '../public/tilemap.png'

const gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const infoCanvas = document.getElementById("infoCanvas") as HTMLCanvasElement
const game = document.getElementById('game')
const homepage = document.getElementById('homepage')
const regPage = document.getElementById('registration')
const leaderboard1 = document.getElementById('lead1')
const leaderboard2 = document.getElementById('lead2')
const leaderBoardTitle = document.getElementById('leader-title')
const gameWin = document.getElementById('gameWin')
const gameOver = document.getElementById('gameOver')

type Sound = {
    damageSound: HTMLAudioElement
    knifeSound: HTMLAudioElement
    mainTheme: HTMLAudioElement
    spawnSound: HTMLAudioElement
    stepSound: HTMLAudioElement
}

let soundManager: Sound = {
    damageSound: document.getElementById('damageSound') as HTMLAudioElement,
    knifeSound: document.getElementById('knifeSound') as HTMLAudioElement,
    mainTheme: document.getElementById('mainTheme') as HTMLAudioElement,
    spawnSound: document.getElementById('spawnSound') as HTMLAudioElement,
    stepSound: document.getElementById('stepSound') as HTMLAudioElement
}

type Player = {
    hp: number
    coords: Coords
    playerImage: HTMLImageElement
    chest: number
    score: number
}

type Knife = {
    direction: Direction
    coords: Coords
    lastUpdate: number
    knifeImage: HTMLImageElement
}

type Enemy = {
    enemyImage: HTMLImageElement
    name: string
    coords: Coords
    hp: number
    speed: number
    lastUpdate: number
    path: Coords[]
}
const totalEnemies: string[] = ['Cyclops', 'Corpse', 'Rat']
const cyclopsImg: number[] = [109]
const corpseImg: number[] = [120, 121, 122]
const ratImg: number[] = [123, 124]
const cyclopsSpawnCoords1: number[] = [118, 119, 120, 134, 135, 136, 137]
const corpseSpawnCoords1: number[] = [44, 45]
const ratSpawnCoords1: number[] = [96, 111, 112, 127, 128, 143, 144, 159, 160, 175, 176, 191]
const cyclopsSpawnCoords2: number[] = [23, 24]
const corpseSpawnCoords2: number[] = [220, 221, 222]
const ratSpawnCoords2: number[] = [96, 111, 112, 127, 128, 143, 144, 159, 160, 175, 176, 191]

const enemies: Enemy[] = []

type Coords = { x: number, y: number }
type Direction = 'r' | 'l' | 'u' | 'd'
type State = 'homepage' | 'firstLevel' | 'secondLevel' | 'registration' | 'gameOver' | 'gameWin'

let playerName: String

let gameState: State
let lastShot = 0
let shotPeriod: number = 270
let lastMove = 0
let movePeriod: number = 170
let knifeUpdatePeriod: number = 90
let lastSpawn = 0
let spawnPeriod: number = 1300

const maxEnemyNumber = 2

let field = field1Json

gameCanvas.height = field.height * field.tileheight * 3
gameCanvas.width = field.width * field.tilewidth * 3
infoCanvas.height = gameCanvas.height
infoCanvas.width = field.tilewidth * 8 * 2
const gameCtx = gameCanvas.getContext("2d");
const infoCtx = infoCanvas.getContext("2d")
gameCtx.imageSmoothingEnabled = false;
infoCtx.imageSmoothingEnabled = false;

let images: HTMLImageElement[] = []
let player: Player
let knifes: Knife[] = []

const tileSet = new Image();

let levelIndicesFirstLayer
let levelIndicesSecondLayer
let indices

let firstScore = 0
let secondScore = 0

type WeightedVertex = {
    vertex: Coords
    weight: number
}

class PriorityQueue {
    items: WeightedVertex[]

    constructor() {
        this.items = [];
    }

    enqueue(element: WeightedVertex) {
        let added = false;
        for (let i = 0; i < this.items.length; i++) {
            if (element.weight < this.items[i].weight) {
                this.items.splice(i, 0, element);
                added = true;
                break;
            }
        }
        if (!added) {
            this.items.push(element);
        }
    }

    dequeue(): WeightedVertex | undefined {
        return this.items.shift();
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }
}

function search(start: Coords, end: Coords) {
    const variants = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    let dist = new Map<string, number>();
    let prev = new Map<string, Coords>();

    function createKey(coords: Coords): string {
        return coords.x + ',' + coords.y
    }

    let q = new PriorityQueue()
    q.enqueue({vertex: start, weight: 0})


    for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
            let coords: Coords = {x: x, y: y}

            if (coords === start) {
                continue
            }

            if (!isValidPosition({x: x, y: y})) {
                continue
            }

            dist.set(createKey(coords), 10000)
        }
    }

    dist.set(createKey(start), 0)

    while (!q.isEmpty()) {
        let cur: WeightedVertex = q.dequeue()!

        if (cur.weight > dist.get(createKey(cur.vertex))!) {
            continue
        }

        for (let variant of variants) {
            let new_coords: Coords = {x: variant[0] + cur.vertex.x, y: variant[1] + cur.vertex.y}

            if (!isValidPosition({x: new_coords.x, y: new_coords.y})) {
                continue
            }

            if (!dist.get(createKey(new_coords))) {
                continue
            }

            let alt: number = cur.weight + 1

            if (alt < dist.get(createKey(new_coords))!) {
                dist.set(createKey(new_coords), alt)
                prev.set(createKey(new_coords), cur.vertex)
                q.enqueue({vertex: new_coords, weight: alt})
            }
        }
    }

    let coords: Coords = end
    let s: Coords[] = []


    while (coords.x !== start.x || coords.y !== start.y) {
        s.push(coords)
        coords = prev.get(createKey(coords))!
    }

    s.push(start)
    return s.reverse()
}

function drawField() {
    indices.forEach((levelIndices) => {
        levelIndices.forEach((index, i) => {
            const img = images[index - 1];
            const x = (i % field.width) * 16;
            const y = Math.floor(i / field.width) * 16;

            if (img) {
                gameCtx.drawImage(img, x * 3, y * 3, 16 * 3, 16 * 3);
            }
        });
    });
}

function startGame() {
    let coords: Coords
    if (gameState == 'firstLevel') {
        field = field1Json
        coords = {x: 2, y: 2}
        tileBarrier = firstTileBarrier
        tileHeal = firstTileHeal
        tileChest = firstTileChest
        tileTrap = firstTileTrap
        spawnPeriod = 5300
    } else if (gameState == 'secondLevel') {
        field = field2Json
        coords = {x: 8, y: 13}
        tileBarrier = secondTileBarrier
        tileHeal = secondTileHeal
        tileChest = secondTileChest
        tileTrap = secondTileTrap
        spawnPeriod = 2500
    }
    levelIndicesFirstLayer = field.layers[0].data;
    levelIndicesSecondLayer = field.layers[1].data;
    indices = [levelIndicesFirstLayer, levelIndicesSecondLayer]
    player = {
        hp: 5,
        playerImage: images[97],
        coords: coords,
        chest: 0,
        score: 0
    }
}

const imgLoadPromise = new Promise(function (resolve, reject) {
    tileSet.onload = () => resolve(null);
    tileSet.onerror = err => reject(err);
});
tileSet.src = <string>tileMap;

async function loadImages() {
    const canvas2 = document.createElement('canvas');
    const ctx2 = canvas2.getContext('2d');

    const tileSize = 16;
    const offset = 1;
    const cols = Math.floor((tileSet.width + offset) / (tileSize + offset));
    const rows = Math.floor((tileSet.height + offset) / (tileSize + offset));
    const imagesArray: Promise<HTMLImageElement>[] = [];

    canvas2.width = tileSet.width;
    canvas2.height = tileSet.height;
    ctx2!.drawImage(tileSet, 0, 0);

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const imageData = ctx2!.getImageData(
                x * (tileSize + offset),
                y * (tileSize + offset),
                tileSize,
                tileSize
            );
            const tileCanvas = document.createElement('canvas');
            tileCanvas.width = tileSize;
            tileCanvas.height = tileSize;
            const tileCtx = tileCanvas.getContext('2d');
            tileCtx!.putImageData(imageData, 0, 0);
            let curImage = new Image();
            imagesArray.push(new Promise(function (resolve, reject) {
                curImage.onerror = err => reject(err);
                curImage.onload = () => resolve(curImage);
            }));
            curImage.src = tileCanvas.toDataURL();
        }
    }
    return Promise.all(imagesArray)
}

function rotateImage(image: HTMLImageElement, degrees: number): HTMLImageElement {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    canvas.width = image.width
    canvas.height = image.height

    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(image, -image.width / 2, -image.height / 2)

    const rotatedImage = new Image()
    rotatedImage.src = canvas.toDataURL()

    return rotatedImage
}

const firstTileBarrier = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 28, 29, 31,
    32, 47,
    48, 63,
    64, 79,
    80, 95,
    101, 102, 103, 104, 105, 106,
    117, 122,
    138,
    149, 150, 151, 152, 153, 154,
    192, 207,
    208, 221, 223,
    224, 226, 227, 239,
    240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255
]
const secondTileBarrier = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 31,
    32, 47,
    48, 63,
    64, 79,
    80, 95,
    182,
    197, 198, 201, 202,
    213, 214, 218,
    225, 226, 229, 230, 234, 236, 237, 238,
    240, 241, 242, 243, 244, 245, 250, 251, 252, 253, 254, 255
]

const firstTileTrap = [53, 77, 199]
const secondTileTrap = [39, 40, 99, 142, 157]

const firstTileHeal = [225]
const secondTileHeal = [23, 24, 224, 249]

const firstTileChest = [30, 121, 237]
const secondTileChest = [44, 66, 239]

let tileBarrier: number[]
let tileTrap: number[]
let tileHeal: number[]
let tileChest: number[]

function isValidPosition(coords: Coords): boolean {
    return (
        coords.y > -1 &&
        coords.x > -1 &&
        coords.x < 16 &&
        coords.y < 16 &&
        !tileBarrier.includes(coords.y * 16 + coords.x)
    )
}

function drawPlayer() {
    gameCtx!.drawImage(player.playerImage, player.coords.x * 16 * 3, player.coords.y * 16 * 3, 48, 48)
}

function drawKnife(knife: Knife) {
    gameCtx.drawImage(knife.knifeImage, knife.coords.x * 16 * 3, knife.coords.y * 16 * 3, 48, 48)
}

function drawEnemy(enemy: Enemy) {
    gameCtx.drawImage(enemy.enemyImage, enemy.coords.x * 16 * 3, enemy.coords.y * 16 * 3, 48, 48)
}

function updateEnemy(enemy: Enemy) {
    const now = Date.now()
    if (now > enemy.lastUpdate + enemy.speed) {
        let path = search(
            {x: enemy.coords.x, y: enemy.coords.y},
            {x: player.coords.x, y: player.coords.y}
        )
        if (path.length > 1 && !checkEnemyOnPosition({
            x: path[1].x,
            y: path[1].y
        })) {
            enemy.coords.x = path[1].x
            enemy.coords.y = path[1].y
            enemy.lastUpdate = Date.now()
            checkPositionAndDamageEnemy(enemy)
            if (enemy.coords.x == player.coords.x && enemy.coords.y == player.coords.y) {
                damagePlayer()
            }
        }
    }
}

function generateAndPushEnemy() {
    const curEnemyName = totalEnemies[Math.floor(Math.random() * totalEnemies.length)]
    let genEnemy: Enemy
    let x: number, y: number, coords: number
    soundManager.spawnSound.play()
    switch (curEnemyName) {
        case 'Cyclops':
            if (gameState === 'firstLevel') {
                coords = cyclopsSpawnCoords1[Math.floor(Math.random() * cyclopsSpawnCoords1.length)]
            } else {
                coords = cyclopsSpawnCoords2[Math.floor(Math.random() * cyclopsSpawnCoords2.length)]
            }
            x = coords % 16
            y = Math.floor(coords / 16)
            genEnemy = {
                enemyImage: images[cyclopsImg[Math.floor(Math.random() * cyclopsImg.length)]],
                name: curEnemyName,
                coords: {x: x, y: y},
                hp: 7,
                speed: 800,
                lastUpdate: 0,
                path: []
            }
            enemies.push(genEnemy)
            break
        case 'Corpse':
            if (gameState === 'firstLevel') {
                coords = corpseSpawnCoords1[Math.floor(Math.random() * corpseSpawnCoords1.length)]
            } else {
                coords = corpseSpawnCoords2[Math.floor(Math.random() * corpseSpawnCoords2.length)]
            }
            x = coords % 16
            y = Math.floor(coords / 16)
            genEnemy = {
                enemyImage: images[corpseImg[Math.floor(Math.random() * corpseImg.length)]],
                name: curEnemyName,
                coords: {x: x, y: y},
                hp: 4,
                speed: 550,
                lastUpdate: 0,
                path: []
            }
            enemies.push(genEnemy)
            break
        case 'Rat':
            if (gameState === 'firstLevel') {
                coords = ratSpawnCoords1[Math.floor(Math.random() * ratSpawnCoords1.length)]
            } else {
                coords = ratSpawnCoords2[Math.floor(Math.random() * ratSpawnCoords2.length)]
            }
            x = coords % 16
            y = Math.floor(coords / 16)
            genEnemy = {
                enemyImage: images[ratImg[Math.floor(Math.random() * ratImg.length)]],
                name: curEnemyName,
                coords: {x: x, y: y},
                hp: 1,
                speed: 380,
                lastUpdate: 0,
                path: []
            }
            enemies.push(genEnemy)
            break
    }
}

function checkPositionAndDamageEnemy(enemy: Enemy) {
    let knifeIndex = knifes.findIndex(knife => knife.coords.x === enemy.coords.x && knife.coords.y === enemy.coords.y)
    if (knifeIndex !== -1) {
        damageEnemy(enemy, true)
        knifes.splice(knifeIndex, 1)
    }
    if (tileTrap.includes(enemy.coords.y * 16 + enemy.coords.x)) {
        damageEnemy(enemy, false)
    }
}

function checkEnemyOnPosition(coords: Coords) {
    for (const enemy of enemies) {
        return enemy.coords.x === coords.x && enemy.coords.y === coords.y
    }
}

function updateKnife(knife: Knife) {
    if (Date.now() > knife.lastUpdate + knifeUpdatePeriod) {
        let deltaX = 0
        let deltaY = 0
        switch (knife.direction) {
            case 'u':
                deltaY -= 1
                break
            case 'd':
                deltaY += 1
                break
            case 'r':
                deltaX += 1
                break
            case 'l':
                deltaX -= 1
                break
        }
        if (isValidPosition({
            x: knife.coords.x + deltaX,
            y: knife.coords.y + deltaY
        })) {
            knife.coords = {
                x: knife.coords.x + deltaX,
                y: knife.coords.y + deltaY
            }
            knife.lastUpdate = Date.now()
            shotEnemy(knife)
        } else {
            let removeInd = knifes.indexOf(knife)
            knifes.splice(removeInd, 1)
        }
    }
}

function damagePlayer() {
    player.hp--
    if (gameState == 'firstLevel') {
        player.coords = {
            x: 2,
            y: 2
        }
    } else {
        player.coords = {
            x: 8,
            y: 13
        }
    }
}

function shotEnemy(knife: Knife) {
    if (checkEnemyOnPosition({x: knife.coords.x, y: knife.coords.y})) {
        damageEnemy(enemies.find(enemy =>
            enemy.coords.x === knife.coords.x && enemy.coords.y === knife.coords.y
        ), true)
        knifes.splice(knifes.indexOf(knife), 1)
    }
}

function damageEnemy(enemy: Enemy, isByPlayer: boolean) {
    soundManager.damageSound.play()
    console.log('damage')
    console.log(enemy)
    enemy.hp--
    if (enemy.hp === 0) {
        let remInd = enemies.indexOf(enemy)
        enemies.splice(remInd, 1)
        if (isByPlayer) {
            switch (enemy.name) {
                case 'Cyclops':
                    player.score += 500
                    break
                case 'Corpse':
                    player.score += 200
                    break
                case 'Rat':
                    player.score += 100
                    break
            }
        }
    }
}

function healPlayer() {
    if (player.hp != 5) {
        player.hp += 1
    }
    indices[1][player.coords.y * 16 + player.coords.x] = 0
    tileHeal = tileHeal.filter(num => num !== player.coords.y * 16 + player.coords.x)
}

function stepOnChest() {
    player.chest += 1
    indices[1][player.coords.y * 16 + player.coords.x] = 0
    tileChest = tileChest.filter(num => num !== player.coords.y * 16 + player.coords.x)
}

function drawInfo() {
    infoCtx!.clearRect(0, 0, infoCanvas.width, infoCanvas.height)
    infoCtx!.font = '56px tiny5';
    infoCtx!.fillStyle = 'White';

    const healthText = `${player.hp} / 5`;
    const healthTextWidth = infoCtx!.measureText(healthText).width;

    const chestText = `${player.chest} / 3`;
    const chestTextWidth = infoCtx!.measureText(chestText).width;

    const scoreText = `${player.score}`
    const scoreTextWidth = infoCtx!.measureText(scoreText).width;

    const textY = 60;

    infoCtx!.fillText(healthText, 0, textY);
    infoCtx!.drawImage(images[127], healthTextWidth + 20, textY - 52, 16 * 5, 16 * 5);

    infoCtx!.fillText(chestText, 0, textY + 100);
    infoCtx!.drawImage(images[92], chestTextWidth + 20, textY + 100 - 52, 16 * 5, 16 * 5);

    infoCtx!.fillText(scoreText, 0, textY + 200);
    infoCtx!.drawImage(images[118], scoreTextWidth + 20, textY + 200 - 52, 16 * 5, 16 * 5);
}

function reloadIndices(level: number) {
    if (level == 1) {
        for (const tileNumber of firstTileChest) {
            indices[1][tileNumber] = 93
        }
        for (const tileNumber of firstTileHeal) {
            indices[1][tileNumber] = 116
        }

    } else {
        for (const tileNumber of secondTileChest) {
            indices[1][tileNumber] = 93
        }
        for (const tileNumber of secondTileHeal) {
            indices[1][tileNumber] = 116
        }
    }
}

function drawGameWinInfo() {
    gameWin.innerHTML = '';
    let winMessages
    if (field === field1Json) {
        winMessages = [
            "Ты прошел первое подземелье!",
            `Твой счет составил ${firstScore}`,
            "Нажмите любую клавишу, чтобы продолжить"
        ];
    } else {
        winMessages = [
            "Ты прошел второе подземелье!",
            `Твой счет составил ${firstScore + secondScore}`,
            "Нажмите любую клавишу, чтобы выйти в меню"
        ];
    }

    winMessages.forEach(message => {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        gameWin.appendChild(messageElement);
    })
}

function drawGameOverInfo() {
    gameOver.innerHTML = '';
    let gameOverMessages
    if (field === field1Json) {
        gameOverMessages = [
            "Ты проиграл на первом подземелье!",
            "Нажмите любую клавишу, чтобы начать его заново"
        ];
    } else {
        gameOverMessages = [
            "Ты проиграл на втором подземелье!",
            "Нажмите любую клавишу, чтобы начать его заново"
        ];
    }

    gameOverMessages.forEach(message => {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        gameOver.appendChild(messageElement);
    })
}

function updateLeaderboard(){
    let currentLD: string[][] = JSON.parse(localStorage.getItem('top') ?? '[]')
    let fl = false
    const gameScore = firstScore + secondScore

    for (let i = 0; i < currentLD.length; i++) {
        if (currentLD[i][0] === playerName){
            currentLD[i][1] = String(Number.parseInt(currentLD[i][1]) + gameScore)
            fl = true
        }
    }
    if (!fl){
        currentLD.push([playerName!, String(gameScore)])
    }

    currentLD.sort(([,aScore], [,bScore]) => {
        return Number.parseInt(bScore) - Number.parseInt(aScore)
    })

    localStorage.setItem('top', JSON.stringify(currentLD))
}

function printLeaderboard() {
    let currentLD: string[][] = JSON.parse(localStorage.getItem('top') ?? '[]')
    if (currentLD.length === 0) {
        leaderBoardTitle.innerText = 'Пока что никто не попал в таблицу рекордов'
    } else {
        leaderBoardTitle!.innerText = 'Таблица рекордов'
        leaderboard1!.innerHTML = ''
        leaderboard2!.innerHTML = ''
        currentLD.slice(0, 5).forEach(([user, score], i) => {
            const lineElem = document.createElement('div');
            lineElem.textContent = `${i + 1}. ${user}: ${score}`
            leaderboard1!.appendChild(lineElem);
        });
        currentLD.slice(5, 10).forEach(([user, score], i) => {
            const lineElem = document.createElement('div')
            lineElem.textContent = `${i + 6}. ${user}: ${score}`
            leaderboard2!.appendChild(lineElem)
        })
    }
}

function gameLoop() {
    if (gameState === 'registration') {
        game!.style.visibility = 'hidden'
        regPage.style.visibility = 'visible'
        const inputForm = document.getElementById('inputForm') as HTMLInputElement
        const submitLink = document.getElementById('submitForm') as HTMLAnchorElement
        const nicknameForm = document.getElementById('nicknameForm') as HTMLFormElement

        nicknameForm.addEventListener('submit', function (e) {
            e.preventDefault()
        })

        submitLink!.addEventListener('click', function () {
            if (inputForm!.value.trim().length === 0) {
                alert('Введи свое имя!')
            } else if (inputForm!.value.trim().length > 20) {
                alert('Твое имя слишком длинное')
            } else {
                playerName = inputForm!.value.trim()
                gameState = 'homepage'
                regPage!.style.visibility = 'hidden'
                homepage!.style.visibility = 'visible'
                gameLoop()
            }
        })
    }

    if (gameState === 'homepage') {
        firstScore = 0
        secondScore = 0
        printLeaderboard()

        const firstLevel = document.getElementById('firstLevel')
        const secondLevel = document.getElementById('secondLevel')

        firstLevel!.addEventListener('click', function () {
            gameState = 'firstLevel'
            homepage!.style.visibility = 'hidden'
            game!.style.visibility = 'visible'
            startGame()
            gameLoop()
        })

        secondLevel!.addEventListener('click', function () {
            gameState = 'secondLevel'
            homepage!.style.visibility = 'hidden'
            game!.style.visibility = 'visible'
            startGame()
            gameLoop()
        })
    }

    if (gameState === 'firstLevel' || gameState == 'secondLevel') {
        soundManager.mainTheme.play()
        gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height)
        drawField();
        processEvents()
        eventData = {...EMPTY_EVENT_DATA}
        drawPlayer();
        drawInfo()

        for (const knife of knifes) {
            drawKnife(knife)
            updateKnife(knife)
        }

        for (const enemy of enemies) {
            drawEnemy(enemy)
            updateEnemy(enemy)
        }

        if (Date.now() > lastSpawn + spawnPeriod && enemies.length < maxEnemyNumber) {
            generateAndPushEnemy()
            lastSpawn = Date.now()
        }

        if (player.chest == 3) {
            enemies.length = 0
            if (gameState === 'firstLevel') {
                firstScore = player.score
                reloadIndices(1)
            } else {
                secondScore = player.score
                updateLeaderboard()
                reloadIndices(2)
            }
            gameState = 'gameWin'
            soundManager.mainTheme.pause()
        }
        if (player.hp <= 0) {
            enemies.length = 0
            if (gameState === 'firstLevel') {
                reloadIndices(1)
            } else {
                reloadIndices(2)
            }
            gameState = 'gameOver'
            soundManager.mainTheme.pause()
        }

        requestAnimationFrame(gameLoop)
    }

    if (gameState === 'gameWin') {
        game.style.visibility = 'hidden'
        gameWin.style.visibility = 'visible'
        drawGameWinInfo()
        requestAnimationFrame(gameLoop)
    }

    if (gameState === 'gameOver') {
        game.style.visibility = 'hidden'
        gameOver.style.visibility = 'visible'
        drawGameOverInfo()
        requestAnimationFrame(gameLoop)
    }
}

interface EventData {
    left: boolean,
    right: boolean,
    down: boolean,
    up: boolean,
    shotUp: boolean
    shotDown: boolean
    shotRight: boolean
    shotLeft: boolean
}

const EMPTY_EVENT_DATA: EventData = {
    shotDown: false,
    shotLeft: false,
    shotRight: false,
    shotUp: false,
    left: false,
    right: false,
    down: false,
    up: false,
}
let eventData: EventData = {...EMPTY_EVENT_DATA}

function processEvents() {
    let deltaXStep = 0
    let deltaYStep = 0
    let deltaXShot = 0
    let deltaYShot = 0
    let shotDirection: Direction
    let shotImage: HTMLImageElement

    if (eventData.shotDown) {
        deltaYShot += 1
        shotDirection = 'd'
        shotImage = rotateImage(images[103], 180)
    }

    if (eventData.shotLeft) {
        deltaXShot -= 1
        shotDirection = 'l'
        shotImage = rotateImage(images[103], 270)
    }

    if (eventData.shotRight) {
        deltaXShot += 1
        shotDirection = 'r'
        shotImage = rotateImage(images[103], 90)
    }

    if (eventData.shotUp) {
        deltaYShot -= 1
        shotDirection = 'u'
        shotImage = rotateImage(images[103], 0)
    }

    if (shotDirection && Date.now() > lastShot + shotPeriod) {
        soundManager.knifeSound.play()
        if (isValidPosition({
            x: player.coords.x + deltaXShot,
            y: player.coords.y + deltaYShot
        })) {
            let knife: Knife = {
                direction: shotDirection,
                lastUpdate: Date.now(),
                coords: {x: player.coords.x + deltaXShot, y: player.coords.y + deltaYShot},
                knifeImage: shotImage
            }
            knifes.push(knife)
            shotEnemy(knife)
            lastShot = Date.now()
        }
    }

    if (eventData.left) {
        deltaXStep--
    }
    if (eventData.right) {
        deltaXStep++
    }
    if (eventData.up) {
        deltaYStep--
    }
    if (eventData.down) {
        deltaYStep++
    }

    if ((deltaYStep != 0 || deltaXStep != 0) && Date.now() > lastMove + movePeriod) {
        if (isValidPosition({
            x: player.coords.x + deltaXStep,
            y: player.coords.y + deltaYStep
        })) {
            soundManager.stepSound.play()
            player.coords.x += deltaXStep
            player.coords.y += deltaYStep
            if (tileTrap.includes(
                player.coords.y * 16 + player.coords.x
            )) {
                damagePlayer()
            }
            if (tileHeal.includes(
                player.coords.y * 16 + player.coords.x
            )) {
                healPlayer()
            }
            if (tileChest.includes(
                player.coords.y * 16 + player.coords.x
            )) {
                stepOnChest()
            }

            lastMove = Date.now()
        }
    }
}

document.addEventListener('keydown', e => {
    if (gameState === 'gameWin') {
        if (field === field1Json) {
            gameState = 'secondLevel'
            game.style.visibility = 'visible'
            startGame()
            gameLoop()
        } else {
            gameState = 'homepage'
            homepage.style.visibility = 'visible'
        }
        gameWin.style.visibility = 'hidden'
    }
    if (gameState === 'gameOver') {
        if (field === field1Json) {
            gameState = 'firstLevel'
            startGame()
            gameLoop()
        } else {
            gameState = 'secondLevel'
            startGame()
            gameLoop()
        }
        gameOver.style.visibility = 'hidden'
        game.style.visibility = 'visible'
    }
    switch (e.key) {
        case 'a':
        case 'ф':
            eventData.left = true;
            break;
        case 'd':
        case 'в':
            eventData.right = true;
            break;
        case 'w':
        case 'ц':
            eventData.up = true;
            break;
        case 's':
        case 'ы':
            eventData.down = true;
            break;
        case 'ArrowUp':
            eventData.shotUp = true;
            break;
        case 'ArrowDown':
            eventData.shotDown = true;
            break;
        case 'ArrowLeft':
            eventData.shotLeft = true;
            break;
        case 'ArrowRight':
            eventData.shotRight = true;
            break;
    }
})

async function main() {
    await imgLoadPromise;
    images = await loadImages()
    gameState = 'registration'
    gameLoop()
}

main()
