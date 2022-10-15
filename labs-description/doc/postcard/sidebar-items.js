window.SIDEBAR_ITEMS = {"enum":[["Error","This is the error type used by Postcard"]],"fn":[["from_bytes","Deserialize a message of type `T` from a byte slice. The unused portion (if any) of the byte slice is not returned."],["from_bytes_cobs","Deserialize a message of type `T` from a cobs-encoded byte slice. The unused portion (if any) of the byte slice is not returned."],["serialize_with_flavor","`serialize_with_flavor()` has three generic parameters, `T, F, O`."],["take_from_bytes","Deserialize a message of type `T` from a byte slice. The unused portion (if any) of the byte slice is returned for further usage"],["take_from_bytes_cobs","Deserialize a message of type `T` from a cobs-encoded byte slice. The unused portion (if any) of the byte slice is returned for further usage"],["to_slice","Serialize a `T` to the given slice, with the resulting slice containing data in a serialized format."],["to_slice_cobs","Serialize a `T` to the given slice, with the resulting slice containing data in a serialized then COBS encoded format. The terminating sentinel `0x00` byte is included in the output buffer."],["to_vec","Serialize a `T` to a `heapless::Vec<u8>`, with the `Vec` containing data in a serialized format. Requires the (default) `heapless` feature."],["to_vec_cobs","Serialize a `T` to a `heapless::Vec<u8>`, with the `Vec` containing data in a serialized then COBS encoded format. The terminating sentinel `0x00` byte is included in the output `Vec`. Requires the (default) `heapless` feature."]],"mod":[["accumulator","An accumulator used to collect chunked COBS data and deserialize it."],["de_flavors","Deserialization Flavors"],["experimental","Experimental Postcard Features"],["ser_flavors","Serialization Flavors"]],"struct":[["Deserializer","A `serde` compatible deserializer, generic over “Flavors” of deserializing plugins."],["Serializer","A `serde` compatible serializer, generic over “Flavors” of serializing plugins."]],"type":[["Result","This is the Result type used by Postcard."]]};