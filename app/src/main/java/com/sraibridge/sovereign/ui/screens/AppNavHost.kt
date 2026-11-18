package com.sraibridge.sovereign.ui.screens

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument

@Composable
fun AppNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = "search") {
        composable("search") {
            SearchScreen(
                onDocumentClick = { docId ->
                    navController.navigate("document/$docId")
                }
            )
        }
        composable(
            route = "document/{docId}",
            arguments = listOf(navArgument("docId") { type = NavType.LongType })
        ) { backStackEntry ->
            val docId = backStackEntry.arguments?.getLong("docId") ?: -1L
            DocumentDetailScreen(
                docId = docId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
