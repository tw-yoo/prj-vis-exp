const REQUIRED_RANGE_TEXT = '>=20.19.0 and <21, or >=22.12.0'

const parseVersion = (raw) => {
  const [majorStr, minorStr, patchStr] = raw.split('.')
  return {
    major: Number(majorStr ?? 0),
    minor: Number(minorStr ?? 0),
    patch: Number(patchStr ?? 0),
  }
}

const isSupportedNodeVersion = ({ major, minor }) => {
  if (major === 20) {
    return minor >= 19
  }
  if (major === 22) {
    return minor >= 12
  }
  return major > 22
}

const versionString = process.versions.node
const parsedVersion = parseVersion(versionString)

if (!isSupportedNodeVersion(parsedVersion)) {
  console.error(`Unsupported Node.js version: ${versionString}`)
  console.error(`Required version range: ${REQUIRED_RANGE_TEXT}`)
  process.exit(1)
}

console.log(`Node.js version check passed: ${versionString}`)
