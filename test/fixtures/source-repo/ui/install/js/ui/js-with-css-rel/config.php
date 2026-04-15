<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
	die();
}

return [
	'js' => 'dist/bundle.js',
	'css' => 'dist/bundle.css',
	'rel' => [
		'main.core',
		'ui.css-no-bundleconfig',
	],
	'skip_core' => false,
];
