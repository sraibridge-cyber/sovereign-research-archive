package com.sraibridge.sovereign.ghost

import android.content.Context
import android.util.Log
import org.mozilla.javascript.Context as RhinoContext
import org.mozilla.javascript.ScriptableObject
import java.io.File
import java.security.MessageDigest

/**
 * Adapter that loads and runs the GHOST kernel (ghost_kernel.js) on Android
 * using Mozilla Rhino (no V8 dependency, no network).
 *
 * GHOST runs in IN-PROCESS dispatch mode — no port binding.
 */
class GhostKernelAdapter(private val appContext: Context) {

    companion object {
        private const val TAG = "GhostKernel"
        private const val KERNEL_ASSET = "ghost_kernel.js"
    }

    private var rhinoContext: RhinoContext? = null
    private var scope: ScriptableObject? = null
    private var kernelLoaded = false
    private var kernelSeal: String = ""

    data class GhostResult(
        val action: String,
        val payload: String,
        val seal: String,
        val coherence: Double
    )

    /**
     * Load the GHOST kernel from assets and evaluate it.
     */
    fun loadKernel(): Boolean {
        return try {
            rhinoContext = RhinoContext.enter()
            rhinoContext?.optimizationLevel = -1  // interpretive mode for Android

            scope = rhinoContext?.initStandardObjects() as ScriptableObject

            val kernelJs = appContext.assets.open(KERNEL_ASSET)
                .bufferedReader().use { it.readText() }

            rhinoContext?.evaluateString(scope, kernelJs, KERNEL_ASSET, 1, null)

            // Verify kernel seal
            val sealFn = scope?.get("seal_kernel", scope)
            if (sealFn != null && sealFn is org.mozilla.javascript.Function) {
                kernelSeal = RhinoContext.toString(
                    sealFn.call(rhinoContext, scope, scope, emptyArray())
                )
            }

            kernelLoaded = true
            Log.i(TAG, "GHOST kernel loaded. Seal: $kernelSeal")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load GHOST kernel", e)
            false
        } finally {
            // Keep context open for dispatch calls
        }
    }

    /**
     * Dispatch an action to the GHOST kernel.
     */
    fun dispatch(action: String, payload: String): GhostResult? {
        if (!kernelLoaded) {
            Log.w(TAG, "dispatch called before kernel loaded")
            return null
        }

        return try {
            val dispatchFn = scope?.get("dispatch", scope)
            if (dispatchFn == null || dispatchFn !is org.mozilla.javascript.Function) {
                Log.w(TAG, "dispatch function not found in kernel")
                return null
            }

            val result = dispatchFn.call(rhinoContext, scope, scope, arrayOf(action, payload))
            val resultStr = RhinoContext.toString(result)

            // Parse result JSON
            val parts = resultStr.split("|")
            GhostResult(
                action = if (parts.size > 0) parts[0] else action,
                payload = if (parts.size > 1) parts[1] else resultStr,
                seal = if (parts.size > 2) parts[2] else kernelSeal,
                coherence = if (parts.size > 3) parts[3].toDoubleOrNull() ?: 0.0 else 0.0
            )
        } catch (e: Exception) {
            Log.e(TAG, "dispatch failed", e)
            null
        }
    }

    /**
     * Search the corpus using GHOST kernel coherence calculus.
     */
    fun searchWithGhost(query: String, results: List<String>): GhostResult? {
        return dispatch("SEARCH", """{"query":"$query","candidates":[${results.joinToString(",") {"\"$it\""}}]}""")
    }

    /**
     * Get the kernel's Merkle seal.
     */
    fun getSeal(): String = kernelSeal

    /**
     * Verify a document against its SHA3-512 hash.
     */
    fun verifyDocument(content: String, expectedHash: String): Boolean {
        val digest = MessageDigest.getInstance("SHA3-512")
        val hashBytes = digest.digest(content.toByteArray())
        val actualHash = hashBytes.joinToString("") { "%02x".format(it) }
        return actualHash.equals(expectedHash, ignoreCase = true)
    }

    fun release() {
        try {
            RhinoContext.exit()
        } catch (_: Exception) {}
        kernelLoaded = false
    }
}
