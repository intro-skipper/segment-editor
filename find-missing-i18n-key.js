const fs = require("fs")
const path = require("path")

// Parse command-line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
	if (arg === "--help") {
		acc.help = true
	} else if (arg.startsWith("--locale=")) {
		acc.locale = arg.split("=")[1]
	}
	return acc
}, {})

// Display help information
if (args.help) {
	console.log(`
Find missing i18n translations

A useful script to identify whether the i18n keys used in component files exist in all language files.

Usage:
  node find-missing-i18n-key.js [options]

Options:
  --locale=<locale>   Only check a specific language (e.g., --locale=de)
  --help              Display help information

Output:
  - Generate a report of missing translations
  `)
	process.exit(0)
}

// Configuration
const SRC_DIR = path.join(__dirname, "src")
const LOCALES_DIR = path.join(__dirname, "src/i18n/locales")
const BASE_LOCALE = "en-US"

// Regular expressions to match i18n keys
const i18nPatterns = [
	/{t\("([^"]+)"\)}/g, // Match {t("key")} format
	/i18nKey="([^"]+)"/g, // Match i18nKey="key" format
	/t\("([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)"\)/g, // Match t("key.nested.path") format
]

// Get all locale files
function getLocaleFiles() {
	try {
		const allFiles = fs.readdirSync(LOCALES_DIR).filter((file) => file.endsWith(".json"))

		// Filter to a specific language if specified
		if (args.locale) {
			const filtered = allFiles.filter((file) => file === `${args.locale}.json`)
			if (filtered.length === 0) {
				console.error(`Error: Locale '${args.locale}' not found`)
				console.error(`Available locales: ${allFiles.map((f) => f.replace(".json", "")).join(", ")}`)
				process.exit(1)
			}
			return filtered
		}
		return allFiles
	} catch (error) {
		if (error.code === "ENOENT") {
			console.error(`Error: Locales directory not found: ${LOCALES_DIR}`)
			process.exit(1)
		}
		throw error
	}
}

// Get the value from JSON by path
function getValueByPath(obj, pathStr) {
	const parts = pathStr.split(".")
	let current = obj

	for (const part of parts) {
		if (current === undefined || current === null) {
			return undefined
		}
		current = current[part]
	}

	return current
}

// Load all locale contents
function loadLocales(localeFiles) {
	const locales = {}
	for (const file of localeFiles) {
		const filePath = path.join(LOCALES_DIR, file)
		const localeName = file.replace(".json", "")
		try {
			locales[localeName] = JSON.parse(fs.readFileSync(filePath, "utf8"))
		} catch (error) {
			console.error(`Error parsing ${file}: ${error.message}`)
			locales[localeName] = null
		}
	}
	return locales
}

// Check if the key exists in all locale files, return a list of missing locales
function checkKeyInLocales(key, locales) {
	const missingLocales = []

	for (const [localeName, content] of Object.entries(locales)) {
		if (content === null) {
			missingLocales.push(localeName)
			continue
		}

		if (getValueByPath(content, key) === undefined) {
			missingLocales.push(localeName)
		}
	}

	return missingLocales
}

// Recursively traverse the directory to find i18n keys
function findMissingI18nKeys() {
	const localeFiles = getLocaleFiles()
	const locales = loadLocales(localeFiles)
	const results = []

	console.log(`\nChecking ${Object.keys(locales).length} locale(s): ${Object.keys(locales).join(", ")}`)

	function walk(dir) {
		const files = fs.readdirSync(dir)

		for (const file of files) {
			const filePath = path.join(dir, file)
			const stat = fs.statSync(filePath)

			// Exclude test files, __mocks__, __tests__, node_modules, and i18n directories
			if (
				filePath.includes(".test.") ||
				filePath.includes("__mocks__") ||
				filePath.includes("__tests__") ||
				filePath.includes("node_modules") ||
				filePath.includes("i18n")
			) {
				continue
			}

			if (stat.isDirectory()) {
				walk(filePath) // Recursively traverse subdirectories
			} else if (stat.isFile() && [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(filePath))) {
				const content = fs.readFileSync(filePath, "utf8")

				// Match all i18n keys
				for (const pattern of i18nPatterns) {
					// Reset lastIndex for each file
					pattern.lastIndex = 0
					let match
					while ((match = pattern.exec(content)) !== null) {
						const key = match[1]
						const missingLocales = checkKeyInLocales(key, locales)
						if (missingLocales.length > 0) {
							// Avoid duplicates
							const existing = results.find((r) => r.key === key)
							if (!existing) {
								results.push({
									key,
									missingLocales,
									file: path.relative(SRC_DIR, filePath),
								})
							}
						}
					}
				}
			}
		}
	}

	walk(SRC_DIR)
	return results
}

// Execute and output the results
function main() {
	try {
		console.log("Scanning source files for i18n keys...")

		const missingKeys = findMissingI18nKeys()

		if (missingKeys.length === 0) {
			console.log("\n✅ All i18n keys are present in all locale files!")
			return
		}

		console.log(`\nMissing i18n keys (${missingKeys.length} issues):\n`)
		missingKeys.forEach(({ key, missingLocales, file }) => {
			console.log(`File: ${file}`)
			console.log(`Key: ${key}`)
			console.log("Missing in:")
			missingLocales.forEach((locale) => console.log(`  - ${locale}`))
			console.log("-------------------")
		})

		// Exit code 1 indicates missing keys
		process.exit(1)
	} catch (error) {
		console.error("Error:", error.message)
		console.error(error.stack)
		process.exit(1)
	}
}

main()
