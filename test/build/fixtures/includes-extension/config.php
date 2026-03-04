<?
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
	die();
}

return [
	'js' => 'dist/extension.bundle.js',
	'css' => 'dist/extension.bundle.css',
	'rel' => [
		'main.popup',
	],
	'includes' => [
		'main.core',
	],
];
