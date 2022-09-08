import NonFungibleToken from {{{ imports.NonFungibleToken }}}
import MetadataViews from {{{ imports.MetadataViews }}}
import FungibleToken from {{{ imports.FungibleToken }}}
import NFTQueue from {{{ imports.NFTQueue }}}

pub contract {{ contractName }}: NonFungibleToken {

    pub let version: String

    // Events
    //
    pub event ContractInitialized()
    pub event Withdraw(id: UInt64, from: Address?)
    pub event Deposit(id: UInt64, to: Address?)
    pub event Minted(id: UInt64)
    pub event Burned(id: UInt64)

    // Named Paths
    //
    pub let CollectionStoragePath: StoragePath
    pub let CollectionPublicPath: PublicPath
    pub let CollectionPrivatePath: PrivatePath

    pub let QueueStoragePath: StoragePath
    pub let QueuePublicPath: PublicPath
    pub let QueuePrivatePath: PrivatePath

    pub let AdminStoragePath: StoragePath

    // totalSupply
    // The total number of {{ contractName }} that have been minted
    //
    pub var totalSupply: UInt64

    pub resource NFT: NonFungibleToken.INFT, MetadataViews.Resolver {

        pub let id: UInt64

        {{#each fields}}
        pub let {{ this.name }}: {{ this.asCadenceTypeString }}
        {{/each}}

        init(
            id: UInt64,
            {{#each fields}}
            {{ this.name }}: {{ this.asCadenceTypeString }},
            {{/each}}
        ) {
            self.id = id
            {{#each fields}}
            self.{{ this.name }} = {{ this.name }}
            {{/each}}
        }

        pub fun getViews(): [Type] {
            {{#if views }}
            return [
                {{#each views}}
                {{{ this.cadenceTypeString }}}{{#unless @last}},{{/unless}}
                {{/each}}
            ]
            {{ else }}
            return []
            {{/if}}
        }

        pub fun resolveView(_ view: Type): AnyStruct? {
            {{#if views }}
            switch view {
                {{#each views}}
                case {{{ this.cadenceTypeString }}}:
                    {{#with this}}
                    {{> (lookup . "id") view=this metadata="self" }}
                    {{/with}}
                {{/each}}
            }

            return nil
            {{ else }}
            return nil
            {{/if}}
        }

        destroy() {
            emit Burned(id: self.id)
        }
    }

    pub resource interface {{ contractName }}CollectionPublic {
        pub fun deposit(token: @NonFungibleToken.NFT)
        pub fun getIDs(): [UInt64]
        pub fun borrowNFT(id: UInt64): &NonFungibleToken.NFT
        pub fun borrow{{ contractName }}(id: UInt64): &{{ contractName }}.NFT? {
            post {
                (result == nil) || (result?.id == id):
                    "Cannot borrow {{ contractName }} reference: The ID of the returned reference is incorrect"
            }
        }
    }

    pub resource Collection: {{ contractName }}CollectionPublic, NonFungibleToken.Provider, NonFungibleToken.Receiver, NonFungibleToken.CollectionPublic, MetadataViews.ResolverCollection {
        
        // dictionary of NFTs
        // NFT is a resource type with an `UInt64` ID field
        //
        pub var ownedNFTs: @{UInt64: NonFungibleToken.NFT}

        // withdraw
        // Removes an NFT from the collection and moves it to the caller
        //
        pub fun withdraw(withdrawID: UInt64): @NonFungibleToken.NFT {
            let token <- self.ownedNFTs.remove(key: withdrawID) ?? panic("missing NFT")

            emit Withdraw(id: token.id, from: self.owner?.address)

            return <- token
        }

        // deposit
        // Takes a NFT and adds it to the collections dictionary
        // and adds the ID to the id array
        //
        pub fun deposit(token: @NonFungibleToken.NFT) {
            let token <- token as! @{{ contractName }}.NFT

            let id: UInt64 = token.id

            // add the new token to the dictionary which removes the old one
            let oldToken <- self.ownedNFTs[id] <- token

            emit Deposit(id: id, to: self.owner?.address)

            destroy oldToken
        }

        // getIDs
        // Returns an array of the IDs that are in the collection
        //
        pub fun getIDs(): [UInt64] {
            return self.ownedNFTs.keys
        }

        // borrowNFT
        // Gets a reference to an NFT in the collection
        // so that the caller can read its metadata and call its methods
        //
        pub fun borrowNFT(id: UInt64): &NonFungibleToken.NFT {
            return (&self.ownedNFTs[id] as &NonFungibleToken.NFT?)!
        }

        // borrow{{ contractName }}
        // Gets a reference to an NFT in the collection as a {{ contractName }}.
        //
        pub fun borrow{{ contractName }}(id: UInt64): &{{ contractName }}.NFT? {
            if self.ownedNFTs[id] != nil {
                let ref = (&self.ownedNFTs[id] as auth &NonFungibleToken.NFT?)!
                return ref as! &{{ contractName }}.NFT
            }

            return nil
        }

        pub fun borrowViewResolver(id: UInt64): &AnyResource{MetadataViews.Resolver} {
            let nft = (&self.ownedNFTs[id] as auth &NonFungibleToken.NFT?)!
            let nftRef = nft as! &{{ contractName }}.NFT
            return nftRef as &AnyResource{MetadataViews.Resolver}
        }

        // destructor
        destroy() {
            destroy self.ownedNFTs
        }

        // initializer
        //
        init () {
            self.ownedNFTs <- {}
        }
    }

    // createEmptyCollection
    // public function that anyone can call to create a new empty collection
    //
    pub fun createEmptyCollection(): @NonFungibleToken.Collection {
        return <- create Collection()
    }

    // Admin
    // Resource that an admin can use to mint NFTs.
    //
    pub resource Admin {

        // mintNFT
        // Mints a new NFT with a new ID
        //
        pub fun mintNFT(
            {{#each fields}}
            {{ this.name }}: {{ this.asCadenceTypeString }},
            {{/each}}
        ): @{{ contractName }}.NFT {
            let nft <- create {{ contractName }}.NFT(
                id: {{ contractName }}.totalSupply,
                {{#each fields}}
                {{ this.name }}: {{ this.name }},
                {{/each}}
            )

            emit Minted(id: nft.id)

            {{ contractName }}.totalSupply = {{ contractName }}.totalSupply + (1 as UInt64)

            return <- nft
        }
    }

    // getPublicPath returns a public path that is scoped to this contract.
    //
    pub fun getPublicPath(suffix: String): PublicPath {
        return PublicPath(identifier: "{{ contractName }}_".concat(suffix))!
    }

    // getPrivatePath returns a private path that is scoped to this contract.
    //
    pub fun getPrivatePath(suffix: String): PrivatePath {
        return PrivatePath(identifier: "{{ contractName }}_".concat(suffix))!
    }

    // getStoragePath returns a storage path that is scoped to this contract.
    //
    pub fun getStoragePath(suffix: String): StoragePath {
        return StoragePath(identifier: "{{ contractName }}_".concat(suffix))!
    }

    priv fun initAdmin(admin: AuthAccount) {
        let collection <- {{ contractName }}.createEmptyCollection()

        admin.save(<- collection, to: {{ contractName }}.CollectionStoragePath)

        let collectionCapability = admin.link<&{{ contractName }}.Collection>({{ contractName }}.CollectionPrivatePath, target: {{ contractName }}.CollectionStoragePath)

        admin.link<&{{ contractName }}.Collection{NonFungibleToken.CollectionPublic, {{ contractName }}.{{ contractName }}CollectionPublic, MetadataViews.ResolverCollection}>({{ contractName }}.CollectionPublicPath, target: {{ contractName }}.CollectionStoragePath)
        
        let queue <- NFTQueue.createEmptyQueue(collectionCapability!)

        admin.save(<- queue, to: self.QueueStoragePath)
        
        admin.link<&{NFTQueue.Receiver}>(self.QueuePublicPath, target: self.QueueStoragePath)
        admin.link<&NFTQueue.Queue>(self.QueuePrivatePath, target: self.QueueStoragePath)

        let adminResource <- create Admin()

        admin.save(<- adminResource, to: self.AdminStoragePath)
    }

    init({{#unless saveAdminResourceToContractAccount }}admin: AuthAccount{{/unless}}) {

        self.version = "{{ freshmintVersion }}"

        self.CollectionPublicPath = {{ contractName }}.getPublicPath(suffix: "Collection")
        self.CollectionStoragePath = {{ contractName }}.getStoragePath(suffix: "Collection")
        self.CollectionPrivatePath = {{ contractName }}.getPrivatePath(suffix: "Collection")

        self.QueuePublicPath = {{ contractName }}.getPublicPath(suffix: "Queue")
        self.QueueStoragePath = {{ contractName }}.getStoragePath(suffix: "Queue")
        self.QueuePrivatePath = {{ contractName }}.getPrivatePath(suffix: "Queue")

        self.AdminStoragePath = {{ contractName }}.getStoragePath(suffix: "Admin")

        // Initialize the total supply
        self.totalSupply = 0

        self.initAdmin(admin: {{#if saveAdminResourceToContractAccount }}self.account{{ else }}admin{{/if}})

        emit ContractInitialized()
    }
}
