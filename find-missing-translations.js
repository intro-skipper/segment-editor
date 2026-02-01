/**
 * Script to find missing translations in locale files
 *
 * Usage:
 *   node find-missing-translations.js [options]
 *
 * Options:
 *   --locale=<locale>   Only check a specific locale (e.g. --locale=fr)
 *   --help              Show this help message
 */

import path from "node:path"
import { promises as fs } from "node:fs"

const readFile = fs.readFile
const readdir = fs.readdir

// Process command line arguments
const args = process.argv.slice(2).reduce(
	(acc, arg) => {
		if (arg === "--help") {
			acc.help = true
		} else if (arg.startsWith("--locale=")) {
			acc.locale = arg.split("=")[1]
		}
		return acc
	},
	{},
)

// Show help if requested
if (args.help) {
	console.log(`
Find Missing Translations

A utility script to identify missing translations across locale files.
Compares non-English locale files to the English (en-US.json) file to find any missing keys.

Usage:
  node find-missing-translations.js [options]

Options:
  --locale=<locale>   Only check a specific locale (e.g. --locale=fr or --locale=de)
  --help              Show this help message

Output:
  - Generates a report of missing translations
  `)
	process.exit(0)
}

// Path to the locales directory
const LOCALES_DIR = path.join(process.cwd(), "src/i18n/locales")
const BASE_LOCALE = "en-US"

// Recursively find all keys in an object
function findKeys(obj, parentKey = "") {
	let keys = []

	for (const [key, value] of Object.entries(obj)) {
		const currentKey = parentKey ? `${parentKey}.${key}` : key

		if (typeof value === "object" && value !== null) {
			// If value is an object, recurse
			keys = [...keys, ...findKeys(value, currentKey)]
		} else {
			// If value is a primitive, add the key
			keys.push(currentKey)
		}
	}

	return keys
}

// Get value at a dotted path in an object
function getValueAtPath(obj, pathStr) {
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

// Shared utility to safely parse JSON files with error handling
async function parseJsonFile(filePath) {
	try {
		const content = await readFile(filePath, "utf8")
		return JSON.parse(content)
	} catch (error) {
		if (error.code === "ENOENT") {
			return null // File doesn't exist
		}
		throw new Error(`Error parsing JSON file '${filePath}': ${error.message}`)
	}
}

// Function to check translations
async function checkTranslations() {
	// Get all locale files
	const dirContents = await readdir(LOCALES_DIR)
	const allLocaleFiles = dirContents.filter(
		(file) => file.endsWith(".json") && file !== `${BASE_LOCALE}.json`
	)

	// Extract locale names from filenames (e.g., "de.json" -> "de", "fr.json" -> "fr")
	const allLocales = allLocaleFiles.map((file) => file.replace(".json", ""))

	// Filter to the specified locale if provided
	const locales = args.locale
		? allLocales.filter((locale) => locale === args.locale)
		: allLocales

	if (args.locale && locales.length === 0) {
		console.error(`Error: Locale '${args.locale}' not found in ${LOCALES_DIR}`)
		console.error(`Available locales: ${allLocales.join(", ")}`)
		process.exit(1)
	}

	console.log(`\nChecking ${locales.length} non-English locale(s): ${locales.join(", ")}`)

	// Load the base (English) locale file
	const baseFilePath = path.join(LOCALES_DIR, `${BASE_LOCALE}.json`)
	const baseContent = await parseJsonFile(baseFilePath)

	if (!baseContent) {
		console.error(`Error: Base locale file not found: ${baseFilePath}`)
		process.exit(1)
	}

	// Get all keys from the base file
	const baseKeys = findKeys(baseContent)
	console.log(`Base locale (${BASE_LOCALE}) has ${baseKeys.length} keys`)

	// Results object to store missing translations
	const missingTranslations = {}

	// Process all locales in parallel
	await Promise.all(
		locales.map(async (locale) => {
			const localeFilePath = path.join(LOCALES_DIR, `${locale}.json`)
			const localeContent = await parseJsonFile(localeFilePath)

			if (!localeContent) {
				missingTranslations[locale] = { error: "File is missing entirely" }
				return
			}

			// Check for missing keys in the locale file
			const missingKeys = []

			for (const key of baseKeys) {
				const baseValue = getValueAtPath(baseContent, key)
				const localeValue = getValueAtPath(localeContent, key)

				if (localeValue === undefined) {
					missingKeys.push({
						key,
						englishValue: baseValue,
					})
				}
			}

			if (missingKeys.length > 0) {
				missingTranslations[locale] = missingKeys
			}
		}),
	)

	return { missingTranslations, hasMissingTranslations: outputResults(missingTranslations) }
}

// Function to output results
function outputResults(missingTranslations) {
	let hasMissingTranslations = false

	console.log(`\nMissing Translations Report:\n`)

	const locales = Object.keys(missingTranslations)

	if (locales.length === 0) {
		console.log("✅ All locales have complete translations!")
		return false
	}

	for (const [locale, missingItems] of Object.entries(missingTranslations)) {
		if (missingItems.error) {
			hasMissingTranslations = true
			console.log(`📝 ${locale}: ${missingItems.error}`)
			continue
		}

		hasMissingTranslations = true
		console.log(`📝 ${locale}: ${missingItems.length} missing translations`)

		for (const { key, englishValue } of missingItems) {
			const displayValue = typeof englishValue === "string" 
				? englishValue.length > 50 ? englishValue.substring(0, 50) + "..." : englishValue
				: JSON.stringify(englishValue)
			console.log(`    ${key}: "${displayValue}"`)
		}

		console.log("")
	}

	return hasMissingTranslations
}

// Main function to find missing translations
async function findMissingTranslations() {
	try {
		console.log("Starting translation check...")

		const { hasMissingTranslations } = await checkTranslations()

		// Summary
		if (!hasMissingTranslations) {
			console.log("\n✅ All translations are complete!")
		} else {
			console.log("\n✏️  To add missing translations:")
			console.log("1. Add the missing keys to the corresponding locale files")
			console.log("2. Translate the English values to the appropriate language")
			console.log("3. Run this script again to verify all translations are complete")
			// Exit with error code to fail CI checks
			process.exit(1)
		}
	} catch (error) {
		console.error("Error:", error.message)
		console.error(error.stack)
		process.exit(1)
	}
}

// Run the main function
findMissingTranslations()
