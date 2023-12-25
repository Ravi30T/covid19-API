const express = require('express')

const path = require('path')

const {open} = require('sqlite')

const sqlite3 = require('sqlite3')

const app = express()

app.use(express.json())

const bcrypt = require('bcrypt')

const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

// Authenticate token

const authenticateToken = (request, response, next) => {
  let jwtToken

  const authHeader = request.headers['authorization']

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

// create new user

app.post('/register', async (request, response) => {
  const userDetails = request.body

  const {username, name, password, gender, location} = userDetails

  let hashedPassword = await bcrypt.hash(password, 10)

  let checkTheUsername = `SELECT * from user WHERE username = '${username}'`

  const userData = await db.get(checkTheUsername)

  if (userData === undefined) {
    let postNewUserQuery = `INSERT INTO user(username,name,password,gender,location)
    VALUES(
      '${username}',
      '${name}',
      '${hashedPassword}',
      '${gender}',
      '${location}'
    );`

    if (password.length < 5) {
      response.status(400)
      response.send('Password is too short')
    } else {
      let newUserDetails = await db.run(postNewUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

// login user

app.post('/login/', async (request, response) => {
  const {username, password} = request.body

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`

  const userData = await db.get(selectUserQuery)

  if (userData === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const validatePassword = await bcrypt.compare(password, userData.password)

    if (validatePassword === true) {
      const payload = {
        username: username,
      }

      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// 1 GET All States Details

app.get('/states/', authenticateToken, async (request, response) => {
  const getAllStatesQuery = `SELECT * FROM state`

  const allStatesDetails = await db.all(getAllStatesQuery)

  response.send(
    allStatesDetails.map(eachState => ({
      stateId: eachState.state_id,
      stateName: eachState.state_name,
      population: eachState.population,
    })),
  )
})

// 2 Returns State Based on State ID

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params

  const getStateIDDetailsQuery = `SELECT * FROM state WHERE state_id = ${stateId}`

  const stateDetails = await db.get(getStateIDDetailsQuery)

  response.send({
    stateId: stateDetails.state_id,
    stateName: stateDetails.state_name,
    population: stateDetails.population,
  })
})

// 3 Create New District in the district table

app.post('/districts/', authenticateToken, async (request, response) => {
  const districtBody = request.body

  const {districtName, stateId, cases, cured, active, deaths} = districtBody

  const addNewDistrictQuery = `INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
  VALUES(
    '${districtName}',
    '${stateId}',
    '${cases}',
    '${cured}',
    '${active}',
    '${deaths}'
  );`

  await db.run(addNewDistrictQuery)

  response.send('District Successfully Added')
})

// 4 Returns a district based on the district Id

app.get(
  '/districts/:districtId',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params

    const districtDetailsQuery = `SELECT * FROM district WHERE district_id = ${districtId}`

    const districtDetails = await db.get(districtDetailsQuery)

    response.send({
      districtId: districtDetails.district_id,
      districtName: districtDetails.district_name,
      stateId: districtDetails.state_id,
      cases: districtDetails.cases,
      cured: districtDetails.cured,
      active: districtDetails.active,
      deaths: districtDetails.deaths,
    })
  },
)

// GET all districts

app.get('/districts/', async (request, response) => {
  const getAll = `SELECT * FROM district`

  const result = await db.all(getAll)

  response.send(result)
})

// 5 Delete District

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params

    const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId}`

    await db.run(deleteDistrictQuery)

    response.send('District Removed')
  },
)

// 6 Update District Details

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params

    const districtBody = request.body

    const {districtName, stateId, cases, cured, active, deaths} = districtBody

    const updateDistrictQuery = `UPDATE district SET
    district_name = '${districtName}',
    state_id = '${stateId}',
    cases = '${cases}',
    cured = '${cured}',
    active = '${active}',
    deaths = '${deaths}'
    
    WHERE district_id = ${districtId};`

    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

// 7 Get Total Stats of State

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params

    const getStateStatsQuery = `SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)

    FROM district 
    WHERE state_id = ${stateId};`

    const stateStats = await db.get(getStateStatsQuery)
    response.send({
      totalCases: stateStats['SUM(cases)'],
      totalCured: stateStats['SUM(cured)'],
      totalActive: stateStats['SUM(active)'],
      totalDeaths: stateStats['SUM(deaths)'],
    })
  },
)

module.exports = app
